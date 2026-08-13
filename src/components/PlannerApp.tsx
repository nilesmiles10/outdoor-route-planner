"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { useLocale, useTranslations } from "next-intl";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import MapView, { type HighlightClick, type Waypoint } from "./MapView";
import SearchField from "./SearchField";
import ElevationChart from "./ElevationChart";
import GradeLegend from "./GradeLegend";
import AccountPanel, { type TourPayload } from "./AccountPanel";
import { cumulativeDistances, detectClimbs } from "@/lib/elevation";
import { parseGpx, sampleAnchors } from "@/lib/gpx";
import ExportMenu from "./ExportMenu";
import { loopVias } from "@/lib/roundtrip";
import { supabaseBrowser } from "@/lib/supabase/client";
import { difficulty } from "@/lib/difficulty";
import {
  CATEGORY_EMOJI,
  HIGHLIGHT_CATEGORIES,
  toFeatureCollection,
  toSegmentFeatureCollection,
  type HighlightPoint,
  type HighlightSegment,
} from "@/lib/highlights";

const SPORTS = ["hike", "run", "touring", "gravel", "mtb", "road", "ebike"] as const;
type Sport = (typeof SPORTS)[number];

type RouteAlert = {
  kind: string; // access_no | access_private | bicycle_no | foot_no
  fromIdx: number;
  toIdx: number;
  distanceM: number;
};

// GEN-143: turn-instructie op geometry-index (uit BRouter voicehints).
type RouteTurn = { i: number; t: string; exit?: number };

// Aaneengesloten onverhard stuk op de route (uit /api/geo/route).
type UnpavedRun = {
  fromIdx: number;
  toIdx: number;
  distanceM: number;
  surfaces: string[];
};

type RouteResult = {
  geometry: GeoJSON.Feature;
  stats: { distanceM: number; timeS: number; ascendM: number; descendM: number };
  surfaces: {
    buckets: { paved: number; unpaved: number; unknown: number };
    detailM: Record<string, number>;
  };
  waytypes: Record<string, number>;
  elevation: number[];
  alerts?: RouteAlert[];
  unpavedRuns?: UnpavedRun[];
  turns?: RouteTurn[];
};

type Slots = (Waypoint | null)[];
type PlanState = { slots: Slots; past: Slots[]; future: Slots[] };
type PlanAction =
  | { type: "set"; index: number; wp: Waypoint | null }
  | { type: "insert"; index: number; wp: Waypoint }
  | { type: "append" }
  | { type: "remove"; index: number }
  | { type: "swap"; a: number; b: number }
  | { type: "reverse" }
  | { type: "undo" }
  | { type: "redo" }
  // Late reverse-geocode result: update the label of the waypoint at these
  // coordinates without touching route state or the undo history.
  | { type: "rename"; lon: number; lat: number; name: string }
  // Replace the whole plan (share-URL restore, GPX import, round trip).
  | { type: "load"; slots: Slots };

function planReducer(state: PlanState, action: PlanAction): PlanState {
  const commit = (slots: Slots): PlanState => ({
    slots,
    past: [...state.past.slice(-49), state.slots],
    future: [],
  });
  switch (action.type) {
    case "set": {
      const slots = [...state.slots];
      slots[action.index] = action.wp;
      return commit(slots);
    }
    case "insert": {
      const slots = [...state.slots];
      slots.splice(action.index, 0, action.wp);
      return commit(slots);
    }
    case "append":
      return commit([...state.slots, null]);
    case "remove": {
      let slots = state.slots.filter((_, i) => i !== action.index);
      while (slots.length < 2) slots = [...slots, null];
      return commit(slots);
    }
    case "swap": {
      const slots = [...state.slots];
      const tmp = slots[action.a] ?? null;
      slots[action.a] = slots[action.b] ?? null;
      slots[action.b] = tmp;
      return commit(slots);
    }
    case "reverse":
      return commit([...state.slots].reverse());
    case "undo": {
      const prev = state.past[state.past.length - 1];
      if (!prev) return state;
      return {
        slots: prev,
        past: state.past.slice(0, -1),
        future: [state.slots, ...state.future].slice(0, 50),
      };
    }
    case "redo": {
      const next = state.future[0];
      if (!next) return state;
      return {
        slots: next,
        past: [...state.past.slice(-49), state.slots],
        future: state.future.slice(1),
      };
    }
    case "rename": {
      const slots = state.slots.map((s) =>
        s && s.lon === action.lon && s.lat === action.lat
          ? { ...s, name: action.name }
          : s,
      );
      return { ...state, slots };
    }
    case "load": {
      let slots = action.slots;
      while (slots.length < 2) slots = [...slots, null];
      return { slots, past: [], future: [] };
    }
  }
}

function coordName(lon: number, lat: number) {
  return `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
}

function isSportClient(v: string): v is Sport {
  return (SPORTS as readonly string[]).includes(v);
}

// Vang de ORIGINELE URL-query één keer op modulescope, vóór React mount. Onder
// React StrictMode mount de planner tweemaal, en tussen die mounts wist het
// URL-schrijf-effect `?w` (filled < 2 op de eerste render). Een effect dat de
// live URL leest ziet bij de tweede mount dus geen `?w` meer en zou dan de
// localStorage-sport over de gedeelde `?sport` heen restoren. Een module-
// singleton overleeft de remount en blijft de echte begin-URL weerspiegelen.
const INITIAL_HAD_ROUTE =
  typeof window !== "undefined" &&
  !!new URLSearchParams(window.location.search).get("w");

function fmtKm(m: number) {
  return (m / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 });
}

// Difficulty formula lives in @/lib/difficulty (shared with the tour page).

// Group raw OSM highway values into Komoot-style waytype buckets.
const WAYTYPE_GROUPS: Record<string, string> = {
  cycleway: "cycleway",
  path: "path",
  footway: "path",
  bridleway: "path",
  steps: "steps",
  track: "track",
  residential: "street",
  living_street: "street",
  pedestrian: "street",
  service: "access",
  unclassified: "road",
  tertiary: "road",
  tertiary_link: "road",
  secondary: "road",
  secondary_link: "road",
  primary: "road",
  primary_link: "road",
  trunk: "road",
  trunk_link: "road",
};
function groupWaytypes(waytypes: Record<string, number>) {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(waytypes)) {
    const g = WAYTYPE_GROUPS[k] ?? "other";
    out[g] = (out[g] ?? 0) + v;
  }
  return Object.entries(out).sort((a, b) => b[1] - a[1]);
}

// Group raw OSM surface values for the detail list.
const SURFACE_GROUPS: Record<string, string> = {
  asphalt: "asphalt",
  paved: "asphalt",
  concrete: "concrete",
  "concrete:plates": "concrete",
  "concrete:lanes": "concrete",
  paving_stones: "paving",
  sett: "cobbles",
  cobblestone: "cobbles",
  gravel: "gravel",
  fine_gravel: "gravel",
  pebblestone: "gravel",
  compacted: "compacted",
  ground: "ground",
  dirt: "ground",
  earth: "ground",
  grass: "grass",
  sand: "sand",
  unknown: "unknown",
};
function groupSurfaces(detail: Record<string, number>) {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(detail)) {
    const g = SURFACE_GROUPS[k] ?? "other";
    out[g] = (out[g] ?? 0) + v;
  }
  return Object.entries(out).sort((a, b) => b[1] - a[1]);
}
function fmtTime(s: number) {
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return `${h}:${String(m).padStart(2, "0")}`;
}

// Rough sport speeds (km/h) for off-grid (straight-line) leg time estimates.
const OFFGRID_SPEED: Record<Sport, number> = {
  hike: 4.5,
  run: 9,
  touring: 17,
  gravel: 19,
  mtb: 14,
  road: 24,
  ebike: 21,
};

function haversineM(a: Waypoint, b: Waypoint): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Off-grid leg (GEN-141 A4): straight line, no routing. Distance = great
// circle, time = distance/sport-speed, surfaces bucket "unknown", flat
// elevation (patched to neighbour values after all legs resolve).
function straightLeg(from: Waypoint, to: Waypoint, sport: Sport): RouteResult {
  const distanceM = haversineM(from, to);
  return {
    geometry: {
      type: "Feature",
      properties: {},
      geometry: {
        type: "LineString",
        coordinates: [
          [from.lon, from.lat],
          [to.lon, to.lat],
        ],
      },
    },
    stats: {
      distanceM,
      timeS: Math.round((distanceM / 1000 / OFFGRID_SPEED[sport]) * 3600),
      ascendM: 0,
      descendM: 0,
    },
    surfaces: { buckets: { paved: 0, unpaved: 0, unknown: distanceM }, detailM: {} },
    waytypes: {},
    elevation: [0, 0],
    alerts: [],
    unpavedRuns: [],
    turns: [],
  };
}

async function reverseName(lon: number, lat: number): Promise<string> {
  try {
    const res = await fetch(`/api/geo/reverse?lon=${lon}&lat=${lat}`);
    const data = await res.json();
    if (data.name) return data.name;
  } catch {
    // fall through
  }
  return `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
}


// Merge per-leg results into one route. Legs share their joint point, so we
// drop the first coordinate/elevation sample of every leg after the first.
function mergeLegs(legs: RouteResult[]): RouteResult {
  const coords: GeoJSON.Position[] = [];
  const elevation: number[] = [];
  const stats = { distanceM: 0, timeS: 0, ascendM: 0, descendM: 0 };
  const buckets = { paved: 0, unpaved: 0, unknown: 0 };
  const detailM: Record<string, number> = {};
  const waytypes: Record<string, number> = {};
  const alerts: RouteAlert[] = [];
  const unpavedRuns: UnpavedRun[] = [];
  const turns: RouteTurn[] = [];
  legs.forEach((leg, i) => {
    const legCoords = (leg.geometry.geometry as GeoJSON.LineString).coordinates;
    // Leg-local index k maps to the merged array: legs after the first drop
    // their shared joint coordinate, so k lands at base + k - 1.
    const base = coords.length;
    const globalIdx = (k: number) => (i === 0 ? k : base + k - 1);
    for (const a of leg.alerts ?? []) {
      alerts.push({
        ...a,
        fromIdx: globalIdx(a.fromIdx),
        toIdx: globalIdx(a.toIdx),
      });
    }
    for (const r of leg.unpavedRuns ?? []) {
      const run = { ...r, fromIdx: globalIdx(r.fromIdx), toIdx: globalIdx(r.toIdx) };
      // Een onverhard stuk dat precies op een via-punt doorloopt is één stuk.
      const last = unpavedRuns[unpavedRuns.length - 1];
      if (last && last.toIdx === run.fromIdx) {
        last.toIdx = run.toIdx;
        last.distanceM += run.distanceM;
        for (const s of run.surfaces) if (!last.surfaces.includes(s)) last.surfaces.push(s);
      } else {
        unpavedRuns.push(run);
      }
    }
    for (const tr of leg.turns ?? []) {
      turns.push({ ...tr, i: globalIdx(tr.i) });
    }
    coords.push(...(i === 0 ? legCoords : legCoords.slice(1)));
    elevation.push(...(i === 0 ? leg.elevation : leg.elevation.slice(1)));
    stats.distanceM += leg.stats.distanceM;
    stats.timeS += leg.stats.timeS;
    stats.ascendM += leg.stats.ascendM;
    stats.descendM += leg.stats.descendM;
    buckets.paved += leg.surfaces.buckets.paved;
    buckets.unpaved += leg.surfaces.buckets.unpaved;
    buckets.unknown += leg.surfaces.buckets.unknown;
    for (const [k, v] of Object.entries(leg.surfaces.detailM)) {
      detailM[k] = (detailM[k] ?? 0) + v;
    }
    for (const [k, v] of Object.entries(leg.waytypes)) {
      waytypes[k] = (waytypes[k] ?? 0) + v;
    }
  });
  return {
    geometry: {
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates: coords },
    },
    stats,
    surfaces: { buckets, detailM },
    waytypes,
    elevation,
    alerts,
    unpavedRuns,
    turns,
  };
}

export default function PlannerApp() {
  const t = useTranslations("planner");
  const locale = useLocale();
  const [plan, dispatch] = useReducer(planReducer, {
    slots: [null, null],
    past: [],
    future: [],
  });
  const [sport, setSport] = useState<Sport>("touring");
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const routeCoords = route
    ? (route.geometry.geometry as GeoJSON.LineString).coordinates
    : null;
  const distances = useMemo(
    () => (routeCoords ? cumulativeDistances(routeCoords) : null),
    [routeCoords],
  );
  // Onverharde stukken op de lijn (amber). Default aan: het is precies wat
  // je vóór een rit wilt weten, en op verharde routes is de laag toch leeg.
  const [showUnpaved, setShowUnpaved] = useState(true);
  // GEN-129: restricted stretches as slices of the route line.
  const alertLines = useMemo<GeoJSON.FeatureCollection | null>(() => {
    if (!route?.alerts?.length || !routeCoords) return null;
    return {
      type: "FeatureCollection",
      features: route.alerts.map((a) => ({
        type: "Feature",
        properties: { kind: a.kind },
        geometry: {
          type: "LineString",
          coordinates: routeCoords.slice(a.fromIdx, a.toIdx + 1),
        },
      })),
    };
  }, [route, routeCoords]);
  // Onverharde stukken als plakjes van de routelijn — zelfde patroon als
  // alertLines. Achter een toggle: op een racefiets-route is dit alleen ruis.
  const unpavedLines = useMemo<GeoJSON.FeatureCollection | null>(() => {
    if (!showUnpaved || !route?.unpavedRuns?.length || !routeCoords) return null;
    return {
      type: "FeatureCollection",
      features: route.unpavedRuns.map((r) => ({
        type: "Feature",
        properties: { distanceM: r.distanceM, surfaces: r.surfaces.join(",") },
        geometry: {
          type: "LineString",
          coordinates: routeCoords.slice(r.fromIdx, r.toIdx + 1),
        },
      })),
    };
  }, [route, routeCoords, showUnpaved]);
  const climbs = useMemo(
    () =>
      route && distances ? detectClimbs(route.elevation, distances) : [],
    [route, distances],
  );
  const hoverPoint =
    hoverIdx !== null && routeCoords ? routeCoords[hoverIdx] ?? null : null;

  const [rtOpen, setRtOpen] = useState(false);
  const [rtTargetKm, setRtTargetKm] = useState(40);
  const [rtBusy, setRtBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Highlights layer (GEN-115) ---
  const sb: SupabaseClient = useMemo(() => supabaseBrowser(), []);
  const [user, setUser] = useState<User | null>(null);
  const [showHl, setShowHl] = useState(true);
  const [hlRows, setHlRows] = useState<HighlightPoint[] | null>(null);
  const [viewport, setViewport] = useState<{
    b: { w: number; s: number; e: number; n: number };
    zoom: number;
  } | null>(null);
  const [hlSegRows, setHlSegRows] = useState<HighlightSegment[] | null>(null);
  // Map-content panel (GEN-137): per-category highlight toggles + km markers.
  const [mapContentOpen, setMapContentOpen] = useState(false);
  const [hiddenCats, setHiddenCats] = useState<Set<string>>(new Set());
  const [showKmMarkers, setShowKmMarkers] = useState(true);
  // Mobiel: bottom-sheet inklapbaar zodat de kaart-first-flow niet permanent
  // 45dvh kwijt is aan het paneel. Alleen relevant onder md (grab-handle is
  // md:hidden); op desktop is het paneel een vaste zijbalk.
  const [sheetCollapsed, setSheetCollapsed] = useState(false);
  // Sport-netwerk-overlays (Waymarked Trails) — opt-in, sport-bewuste default
  // zou stille tile-load betekenen; bewust handmatig.
  const [networks, setNetworks] = useState({ hiking: false, cycling: false, mtb: false });

  // Map-content-voorkeuren onthouden tussen bezoeken (localStorage). Voorheen
  // resette elke reload de highlights/km-markers/onverhard/categorieën/netwerk-
  // toggles naar default — wie de kaart opschoonde, moest dat elke keer opnieuw.
  // Restore ná mount (niet in de state-init) om hydration-mismatch te vermijden.
  const MAP_PREFS_KEY = "tarnoo:mapContent";
  useEffect(() => {
    try {
      const raw = localStorage.getItem(MAP_PREFS_KEY);
      if (!raw) return;
      const p = JSON.parse(raw);
      if (typeof p.showHl === "boolean") setShowHl(p.showHl);
      if (typeof p.showKmMarkers === "boolean") setShowKmMarkers(p.showKmMarkers);
      if (typeof p.showUnpaved === "boolean") setShowUnpaved(p.showUnpaved);
      if (Array.isArray(p.hiddenCats)) setHiddenCats(new Set(p.hiddenCats));
      if (p.networks && typeof p.networks === "object") {
        setNetworks({
          hiking: !!p.networks.hiking,
          cycling: !!p.networks.cycling,
          mtb: !!p.networks.mtb,
        });
      }
    } catch {
      // corrupte/geblokkeerde storage — negeer, gebruik defaults
    }
  }, []);
  // Sla de eerste render over: dan draait dit effect nog met de DEFAULT-state
  // (de restore-setState is wel gepland maar nog niet toegepast), waardoor het
  // de zojuist gelezen voorkeuren met defaults zou overschrijven. Pas persist
  // vanaf de tweede render (= restore toegepast, of een echte gebruikers-wijziging).
  const mapPrefsPrimed = useRef(false);
  useEffect(() => {
    if (!mapPrefsPrimed.current) {
      mapPrefsPrimed.current = true;
      return;
    }
    try {
      localStorage.setItem(
        MAP_PREFS_KEY,
        JSON.stringify({
          showHl,
          showKmMarkers,
          showUnpaved,
          hiddenCats: Array.from(hiddenCats),
          networks,
        }),
      );
    } catch {
      /* storage vol/geblokkeerd — negeer */
    }
  }, [showHl, showKmMarkers, showUnpaved, hiddenCats, networks]);
  // Onthoud de laatst gekozen sport, zodat de planner niet elke sessie op
  // "touring" terugvalt. Restore is bewust GEGATE op de afwezigheid van `?w`:
  // een gedeelde route-link (`?w=...&sport=...`) bevat zijn eigen sport en die
  // wint — de restore hieronder vuurt alleen voor een verse planner (geen
  // waypoints in de URL) en concurreert dus nooit met de deel-URL-afhandeling
  // (de `?sport`-regel in de URL-leeseffect). Run-once (`[]`), dus geen
  // her-run op een door de schrijf-effect opgeschoonde URL.
  const SPORT_KEY = "tarnoo:sport";
  useEffect(() => {
    // Gate op de bij-modulelaad opgevangen begin-URL, NIET op de live URL:
    // die is onder StrictMode al gewist tegen de tweede mount (zie comment bij
    // INITIAL_HAD_ROUTE). Een gedeelde route-link wint zo altijd van localStorage.
    if (INITIAL_HAD_ROUTE) return;
    try {
      const saved = localStorage.getItem(SPORT_KEY);
      if (saved && isSportClient(saved)) setSport(saved);
    } catch {
      // storage geblokkeerd — gebruik default
    }
  }, []);
  // Zelfde eerste-render-skip als map-prefs: anders schrijft dit effect de
  // default "touring" over de zojuist gerestorede waarde heen.
  const sportPrimed = useRef(false);
  useEffect(() => {
    if (!sportPrimed.current) {
      sportPrimed.current = true;
      return;
    }
    try {
      localStorage.setItem(SPORT_KEY, sport);
    } catch {
      /* storage vol/geblokkeerd — negeer */
    }
  }, [sport]);
  // Saved places (GEN-137): owner-only star layer, balloon save/unsave.
  const [savedRows, setSavedRows] = useState<
    { id: string; name: string; lon: number; lat: number }[] | null
  >(null);
  const [showSaved, setShowSaved] = useState(true);
  const [selectedHl, setSelectedHl] = useState<HighlightClick | null>(null);
  const [hlScore, setHlScore] = useState<number | null>(null);
  const [myVote, setMyVote] = useState<0 | 1 | -1>(0);
  // Create-highlight flow: arm → next map click drops the pin → mini form.
  const [addingHl, setAddingHl] = useState(false);
  const [pendingHl, setPendingHl] = useState<{ lon: number; lat: number } | null>(null);
  const [newHlName, setNewHlName] = useState("");
  const [newHlCat, setNewHlCat] = useState<string>("viewpoint");
  const [segOpen, setSegOpen] = useState(false);
  const [segName, setSegName] = useState("");
  const [segCat, setSegCat] = useState<string>("water");

  useEffect(() => {
    sb.auth.getUser().then(({ data }) => setUser(data.user));
    const { data: sub } = sb.auth.onAuthStateChange((_e, s) =>
      setUser(s?.user ?? null),
    );
    return () => sub.subscription.unsubscribe();
  }, [sb]);

  // Saved places follow the session: load on login, drop on logout.
  useEffect(() => {
    if (!user) {
      setSavedRows(null);
      return;
    }
    sb.from("saved_places")
      .select("id,name,lon,lat")
      .order("created_at", { ascending: false })
      .limit(500)
      .then(({ data }) =>
        setSavedRows(
          (data as { id: string; name: string; lon: number; lat: number }[]) ?? [],
        ),
      );
  }, [sb, user]);

  const savedFeatures = useMemo<GeoJSON.FeatureCollection | null>(
    () =>
      showSaved && savedRows && savedRows.length > 0
        ? {
            type: "FeatureCollection",
            features: savedRows.map((r) => ({
              type: "Feature",
              properties: { id: r.id, name: r.name },
              geometry: { type: "Point", coordinates: [r.lon, r.lat] },
            })),
          }
        : null,
    [showSaved, savedRows],
  );

  // Highlights per kaartbeeld laden. "Alles in één keer" werkte met 680
  // rijen, maar de OSM-seed maakt er honderdduizenden: PostgREST kapt stil
  // af op max-rows (1000) — je kreeg dan een willekeurige 1000 (in de
  // praktijk de oudste = NL/BE) en overal elders een lege kaart.
  const HL_MIN_ZOOM = 8;
  const HL_MAX_ROWS = 800; // onder PostgREST's 1000-cap
  useEffect(() => {
    if (!showHl || !viewport) return;
    if (viewport.zoom < HL_MIN_ZOOM) {
      setHlRows([]);
      return;
    }
    let cancelled = false;
    // Debounce: pannen/zoomen vuurt moveend vaak.
    const t = setTimeout(() => {
      const { w, s, e, n } = viewport.b;
      sb.from("highlights")
        .select("id,name,category,lon,lat,description")
        .eq("kind", "point")
        .gte("lon", w)
        .lte("lon", e)
        .gte("lat", s)
        .lte("lat", n)
        .limit(HL_MAX_ROWS)
        .then(({ data }) => {
          if (!cancelled) setHlRows((data as HighlightPoint[]) ?? []);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [showHl, viewport, sb]);

  // Load segment-highlights (lines) once when the layer is on.
  useEffect(() => {
    if (!showHl || hlSegRows !== null) return;
    sb.from("highlights")
      .select("id,name,category,description,lon,lat,geometry")
      .eq("kind", "segment")
      .limit(2000)
      .then(({ data }) => setHlSegRows((data as HighlightSegment[]) ?? []));
  }, [showHl, hlSegRows, sb]);

  // Komoot shows highlights — points AND segments — as bullets on the map;
  // a segment's path is only drawn when its bullet is clicked (see hlSegLine).
  const hlFeatures = useMemo(() => {
    if (!showHl) return null;
    const points = (hlRows ?? []).filter((h) => !hiddenCats.has(h.category));
    const segBullets = (hlSegRows ?? [])
      .filter((h) => !hiddenCats.has(h.category))
      .map((s) => ({
        id: s.id,
        name: s.name,
        category: s.category,
        lon: s.lon,
        lat: s.lat,
        description: s.description,
      }));
    return toFeatureCollection([...points, ...segBullets]);
  }, [showHl, hlRows, hlSegRows, hiddenCats]);

  // Only the selected segment's line is drawn (Komoot behaviour). Derived
  // from the open balloon, so the path clears automatically when it closes.
  const hlSegLine = useMemo(() => {
    if (!selectedHl) return null;
    const seg = (hlSegRows ?? []).find((s) => s.id === selectedHl.id);
    return seg ? toSegmentFeatureCollection([seg]) : null;
  }, [selectedHl, hlSegRows]);

  // Category counts for the map-content panel (GEN-137).
  const catCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const h of hlRows ?? []) m.set(h.category, (m.get(h.category) ?? 0) + 1);
    return m;
  }, [hlRows]);

  // Alleen bijwerken bij een merkbare verschuiving, anders triggert elke
  // micro-move (en het moveend na een fitBounds) een nieuwe fetch.
  const handleViewportChange = useCallback(
    (b: { w: number; s: number; e: number; n: number }, zoom: number) => {
      setViewport((prev) => {
        if (
          prev &&
          Math.abs(prev.zoom - zoom) < 0.5 &&
          Math.abs(prev.b.w - b.w) < 0.01 &&
          Math.abs(prev.b.s - b.s) < 0.01 &&
          Math.abs(prev.b.e - b.e) < 0.01 &&
          Math.abs(prev.b.n - b.n) < 0.01
        ) {
          return prev;
        }
        return { b, zoom };
      });
    },
    [],
  );

  const handleHighlightClick = useCallback(
    (h: HighlightClick) => {
      setSelectedHl(h);
      setHlScore(null);
      setMyVote(0);
      sb.from("highlight_votes")
        .select("user_id,value")
        .eq("highlight_id", h.id)
        .then(({ data }) => {
          const rows = (data as { user_id: string; value: number }[]) ?? [];
          setHlScore(rows.reduce((s, r) => s + r.value, 0));
          const mine = user && rows.find((r) => r.user_id === user.id);
          setMyVote((mine?.value as 1 | -1 | undefined) ?? 0);
        });
    },
    [sb, user],
  );

  async function voteHl(value: 1 | -1) {
    if (!selectedHl || !user) return;
    if (myVote === value) {
      // clicking the same arrow again removes the vote
      await sb
        .from("highlight_votes")
        .delete()
        .eq("highlight_id", selectedHl.id)
        .eq("user_id", user.id);
      setHlScore((s) => (s === null ? s : s - value));
      setMyVote(0);
    } else {
      await sb
        .from("highlight_votes")
        .upsert(
          { user_id: user.id, highlight_id: selectedHl.id, value },
          { onConflict: "user_id,highlight_id" },
        );
      setHlScore((s) => (s === null ? s : s + value - myVote));
      setMyVote(value);
    }
  }

  async function createHighlight() {
    if (!pendingHl || !user || !newHlName.trim()) return;
    const { data, error: err } = await sb
      .from("highlights")
      .insert({
        creator: user.id,
        name: newHlName.trim(),
        category: newHlCat,
        kind: "point",
        lon: pendingHl.lon,
        lat: pendingHl.lat,
      })
      .select("id,name,category,lon,lat,description")
      .single();
    if (!err && data) {
      setHlRows((rows) => [...(rows ?? []), data as HighlightPoint]);
      setPendingHl(null);
      setNewHlName("");
    }
  }

  // A3: turn the current planned route into a segment highlight (kind=segment,
  // geometry = the route line). lon/lat = route midpoint as the anchor point.
  async function createSegment() {
    if (!routeCoords || routeCoords.length < 2 || !user || !segName.trim())
      return;
    const mid = routeCoords[Math.floor(routeCoords.length / 2)];
    if (!mid || mid[0] == null || mid[1] == null) return;
    const geometry: GeoJSON.LineString = {
      type: "LineString",
      coordinates: routeCoords,
    };
    const { data, error: err } = await sb
      .from("highlights")
      .insert({
        creator: user.id,
        name: segName.trim(),
        category: segCat,
        kind: "segment",
        lon: mid[0],
        lat: mid[1],
        geometry,
      })
      .select("id,name,category,description,geometry")
      .single();
    if (!err && data) {
      setHlSegRows((rows) => [...(rows ?? []), data as HighlightSegment]);
      setSegOpen(false);
      setSegName("");
    }
  }


  const filled = plan.slots.filter((s): s is Waypoint => s !== null);

  // Round trip à la Komoot's "Heen en terug" toggle: the route ends where it
  // starts (last waypoint = copy of the start). Derived from the slots, so
  // manually dragging the end point away flips it off automatically.
  const isLoop =
    filled.length >= 3 &&
    filled[0].lon === filled[filled.length - 1].lon &&
    filled[0].lat === filled[filled.length - 1].lat;

  const toggleRoundTrip = useCallback(() => {
    if (isLoop) {
      // Remove the trailing start-copy → last via becomes the destination.
      let last = -1;
      plan.slots.forEach((s, i) => {
        if (s !== null) last = i;
      });
      if (last >= 0) dispatch({ type: "remove", index: last });
    } else {
      const start = plan.slots.find((s) => s !== null);
      if (!start) return;
      dispatch({ type: "insert", index: plan.slots.length, wp: { ...start } });
    }
  }, [isLoop, plan.slots]);

  // Panel-row hover ↔ map-marker emphasis (GEN-141 A6)
  const [emphasisSlot, setEmphasisSlot] = useState<number | null>(null);

  // Segment midpoint handles à la Komoot (GEN-141 A1): one visible grab-circle
  // per leg, placed on the routed geometry halfway between the two waypoints.
  const viaHandles = useMemo<GeoJSON.FeatureCollection | null>(() => {
    if (!route || !routeCoords || filled.length < 2) return null;
    const nearestIdx = (pLon: number, pLat: number) => {
      let best = 0;
      let bestD = Infinity;
      for (let i = 0; i < routeCoords.length; i++) {
        const dx = routeCoords[i][0] - pLon;
        const dy = routeCoords[i][1] - pLat;
        const d = dx * dx + dy * dy;
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      return best;
    };
    const features: GeoJSON.Feature[] = [];
    for (let i = 0; i < filled.length - 1; i++) {
      const a = nearestIdx(filled[i].lon, filled[i].lat);
      const b = nearestIdx(filled[i + 1].lon, filled[i + 1].lat);
      const mid = routeCoords[Math.round((a + b) / 2)];
      if (mid) {
        features.push({
          type: "Feature",
          properties: { leg: i },
          geometry: { type: "Point", coordinates: mid },
        });
      }
    }
    return { type: "FeatureCollection", features };
  }, [route, routeCoords, filled]);

  // Off-grid legs (GEN-141 A4): straight dashed lines for legs whose target
  // waypoint carries offGrid=true.
  const offGridLines = useMemo<GeoJSON.FeatureCollection | null>(() => {
    const features: GeoJSON.Feature[] = [];
    for (let i = 1; i < filled.length; i++) {
      if (filled[i].offGrid) {
        features.push({
          type: "Feature",
          properties: {},
          geometry: {
            type: "LineString",
            coordinates: [
              [filled[i - 1].lon, filled[i - 1].lat],
              [filled[i].lon, filled[i].lat],
            ],
          },
        });
      }
    }
    return features.length ? { type: "FeatureCollection", features } : null;
  }, [filled]);

  // Distance markers along the route (GEN-137): every 5 km, 10 km on long routes.
  const kmMarkers = useMemo<GeoJSON.FeatureCollection | null>(() => {
    if (!showKmMarkers || !routeCoords || !distances || distances.length === 0)
      return null;
    const total = distances[distances.length - 1] ?? 0;
    const stepM = (total > 100_000 ? 10 : 5) * 1000;
    const features: GeoJSON.Feature[] = [];
    let next = stepM;
    for (let i = 0; i < distances.length && next < total; i++) {
      if ((distances[i] ?? 0) >= next) {
        const c = routeCoords[i];
        if (c) {
          features.push({
            type: "Feature",
            properties: { label: String(Math.round(next / 1000)) },
            geometry: { type: "Point", coordinates: c },
          });
        }
        next += stepM;
      }
    }
    return features.length ? { type: "FeatureCollection", features } : null;
  }, [showKmMarkers, routeCoords, distances]);

  // Per-leg cache: editing one waypoint only refetches the adjacent legs,
  // everything else is served from cache (Komoot-style incremental routing).
  const legCache = useRef(new Map<string, RouteResult>());
  const seqRef = useRef(0);

  const fetchRoute = useCallback(async () => {
    if (filled.length < 2) {
      setRoute(null);
      return;
    }
    const seq = ++seqRef.current;
    setLoading(true);
    setError(null);
    try {
      const legs = await Promise.all(
        filled.slice(0, -1).map(async (from, i) => {
          const to = filled[i + 1];
          if (to.offGrid) return straightLeg(from, to, sport);
          const key = `${from.lon},${from.lat}|${to.lon},${to.lat}|${sport}`;
          const cached = legCache.current.get(key);
          if (cached) return cached;
          const points = `${from.lon},${from.lat}|${to.lon},${to.lat}`;
          const res = await fetch(
            `/api/geo/route?points=${encodeURIComponent(points)}&sport=${sport}`,
          );
          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(body.error ?? "error");
          }
          const leg = (await res.json()) as RouteResult;
          legCache.current.set(key, leg);
          if (legCache.current.size > 200) {
            const oldest = legCache.current.keys().next().value;
            if (oldest) legCache.current.delete(oldest);
          }
          return leg;
        }),
      );
      if (seq !== seqRef.current) return; // a newer edit superseded this one
      // Patch off-grid legs' flat elevation to their neighbours' edge values
      // so the profile chart doesn't dip to 0 across straight segments.
      const patched = legs.map((leg, i) => {
        if (!filled[i + 1]?.offGrid) return leg;
        const prev = legs[i - 1];
        const next = legs[i + 1];
        const e0 = prev?.elevation[prev.elevation.length - 1] ?? next?.elevation[0] ?? 0;
        const e1 = next?.elevation[0] ?? e0;
        return { ...leg, elevation: [e0, e1] };
      });
      setRoute(patched.length === 1 ? patched[0] : mergeLegs(patched));
    } catch (e) {
      if (seq !== seqRef.current) return;
      setRoute(null);
      setError(e instanceof Error ? e.message : "error");
    } finally {
      if (seq === seqRef.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(filled), sport]);

  useEffect(() => {
    fetchRoute();
  }, [fetchRoute]);

  // Keyboard: undo/redo + Esc closes the click balloon
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        dispatch({ type: e.shiftKey ? "redo" : "undo" });
      }
      if (e.key === "Escape") setBalloon(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Late name lookup: waypoints appear instantly with a coordinate label,
  // the reverse-geocoded name patches in when it arrives (no history entry).
  const patchName = useCallback((lon: number, lat: number) => {
    reverseName(lon, lat).then((name) =>
      dispatch({ type: "rename", lon, lat, name }),
    );
  }, []);

  // --- Share URL: restore on mount, write on change (GEN-108) ---
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    // Header place-search: ?at=lon,lat&atn=Name → prefill start point
    const at = params.get("at");
    if (at) {
      const [lon, lat] = at.split(",").map(Number);
      if (Number.isFinite(lon) && Number.isFinite(lat)) {
        const name = params.get("atn") ?? coordName(lon, lat);
        dispatch({ type: "load", slots: [{ name, lon, lat }, null] });
      }
    }
    const w = params.get("w");
    if (!w) return;
    // Point format: "lon,lat" with optional ",o" suffix = off-grid leg.
    const pts = w
      .split(";")
      .map((p) => {
        const parts = p.split(",");
        const lon = Number(parts[0]);
        const lat = Number(parts[1]);
        if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
        return { lon, lat, offGrid: parts[2] === "o" };
      })
      .filter((p): p is { lon: number; lat: number; offGrid: boolean } => p !== null);
    if (pts.length < 2) return;
    const s = params.get("sport");
    if (s && isSportClient(s)) setSport(s);
    dispatch({
      type: "load",
      slots: pts.map(({ lon, lat, offGrid }) => ({
        name: coordName(lon, lat),
        lon,
        lat,
        ...(offGrid ? { offGrid: true } : {}),
      })),
    });
    pts.forEach(({ lon, lat }) => patchName(lon, lat));
  }, [patchName]);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (filled.length >= 2) {
      url.searchParams.set(
        "w",
        filled
          .map(
            (p) =>
              `${p.lon.toFixed(5)},${p.lat.toFixed(5)}${p.offGrid ? ",o" : ""}`,
          )
          .join(";"),
      );
      url.searchParams.set("sport", sport);
    } else {
      url.searchParams.delete("w");
      url.searchParams.delete("sport");
    }
    window.history.replaceState(null, "", url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(filled), sport]);

  // --- GPX import (GEN-108); export loopt via ExportMenu (GEN-143) ---
  const handleImportFile = useCallback(
    async (file: File) => {
      const pts = parseGpx(await file.text());
      if (pts.length < 2) {
        setError("gpx_invalid");
        return;
      }
      const anchors = sampleAnchors(pts, 6);
      dispatch({
        type: "load",
        slots: anchors.map(([lon, lat]) => ({
          name: coordName(lon, lat),
          lon,
          lat,
        })),
      });
      anchors.forEach(([lon, lat]) => patchName(lon, lat));
    },
    [patchName],
  );

  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable — ignore
    }
  }, []);

  // --- Round trip (GEN-107): synthesize loop, measure once, refine once ---
  const handleGenerateLoop = useCallback(async () => {
    const start = filled[0];
    if (!start) {
      setError("roundtrip_needs_start");
      return;
    }
    setRtBusy(true);
    setError(null);
    try {
      const bearing = Math.floor(Math.random() * 360);
      const targetM = rtTargetKm * 1000;
      const measure = async (scale: number) => {
        const [p1, p2] = loopVias([start.lon, start.lat], targetM, bearing, scale);
        const points = [
          `${start.lon},${start.lat}`,
          `${p1[0]},${p1[1]}`,
          `${p2[0]},${p2[1]}`,
          `${start.lon},${start.lat}`,
        ].join("|");
        const res = await fetch(
          `/api/geo/route?points=${encodeURIComponent(points)}&sport=${sport}`,
        );
        if (!res.ok) throw new Error("no_route");
        const data = (await res.json()) as RouteResult;
        return { p1, p2, distanceM: data.stats.distanceM };
      };
      let attempt = await measure(1);
      const ratio = targetM / attempt.distanceM;
      if (Math.abs(1 - ratio) > 0.15) {
        attempt = await measure(ratio);
      }
      const { p1, p2 } = attempt;
      dispatch({
        type: "load",
        slots: [
          start,
          { name: coordName(p1[0], p1[1]), lon: p1[0], lat: p1[1] },
          { name: coordName(p2[0], p2[1]), lon: p2[0], lat: p2[1] },
          { ...start },
        ],
      });
      patchName(p1[0], p1[1]);
      patchName(p2[0], p2[1]);
    } catch {
      setError("no_route");
    } finally {
      setRtBusy(false);
    }
  }, [filled, rtTargetKm, sport, patchName]);

  // --- Komoot-style click balloon ---
  // Map click opens a balloon with explicit choices (start / destination /
  // via) instead of instantly mutating the route. slotIndex != null means the
  // balloon belongs to an existing waypoint (shows remove instead).
  const [balloon, setBalloon] = useState<{
    lon: number;
    lat: number;
    name: string;
    slotIndex: number | null;
    savedId?: string | null;
  } | null>(null);
  // Komoot's "off-grid segment" toggle: the placed point connects with a
  // straight line instead of a routed leg (GEN-141 A4).
  const [offGridChecked, setOffGridChecked] = useState(false);

  const handleMapClick = useCallback(
    (lon: number, lat: number) => {
      if (addingHl) {
        setPendingHl({ lon, lat });
        setAddingHl(false);
        return;
      }
      setSelectedHl(null);
      setOffGridChecked(false);
      setBalloon({ lon, lat, name: coordName(lon, lat), slotIndex: null });
      // Patch in the reverse-geocoded name if the balloon is still here.
      reverseName(lon, lat).then((name) =>
        setBalloon((prev) =>
          prev && prev.lon === lon && prev.lat === lat ? { ...prev, name } : prev,
        ),
      );
    },
    [addingHl],
  );

  // Waypoint marker click → balloon on that waypoint (remove / make start).
  const handleMarkerClick = useCallback(
    (slotIndex: number) => {
      const wp = plan.slots[slotIndex];
      if (!wp) return;
      setSelectedHl(null);
      setBalloon({ lon: wp.lon, lat: wp.lat, name: wp.name, slotIndex });
    },
    [plan.slots],
  );

  // Saved-place star click → balloon with route actions + unsave.
  const handleSavedPlaceClick = useCallback(
    (pl: { id: string; name: string; lon: number; lat: number }) => {
      setSelectedHl(null);
      setOffGridChecked(false);
      setBalloon({
        lon: pl.lon,
        lat: pl.lat,
        name: pl.name,
        slotIndex: null,
        savedId: pl.id,
      });
    },
    [],
  );

  async function toggleSavedPlace() {
    if (!user || !balloon || balloon.slotIndex !== null) return;
    if (balloon.savedId) {
      const id = balloon.savedId;
      await sb.from("saved_places").delete().eq("id", id);
      setSavedRows((rows) => (rows ?? []).filter((r) => r.id !== id));
      setBalloon((prev) => (prev ? { ...prev, savedId: null } : prev));
    } else {
      const { data } = await sb
        .from("saved_places")
        .insert({
          owner: user.id,
          name: balloon.name,
          kind: "place",
          lon: balloon.lon,
          lat: balloon.lat,
        })
        .select("id,name,lon,lat")
        .single();
      if (data) {
        setSavedRows((rows) => [data, ...(rows ?? [])]);
        setBalloon((prev) => (prev ? { ...prev, savedId: data.id } : prev));
      }
    }
  }

  // Save a highlight as a personal place (from the highlight card).
  async function saveHighlightAsPlace() {
    if (!user || !selectedHl) return;
    const { data } = await sb
      .from("saved_places")
      .insert({
        owner: user.id,
        name: selectedHl.name,
        kind: "highlight",
        lon: selectedHl.lon,
        lat: selectedHl.lat,
      })
      .select("id,name,lon,lat")
      .single();
    if (data) setSavedRows((rows) => [data, ...(rows ?? [])]);
  }

  // Where along the route should a via at (lon,lat) be inserted? Returns the
  // slot index, or null when there's no route to bracket against.
  const viaSlotIndexFor = useCallback(
    (lon: number, lat: number): number | null => {
      if (!route || filled.length < 2) return null;
      const coords = (route.geometry.geometry as GeoJSON.LineString).coordinates;
      const nearestIdx = (pLon: number, pLat: number) => {
        let best = 0;
        let bestD = Infinity;
        for (let i = 0; i < coords.length; i++) {
          const dx = coords[i][0] - pLon;
          const dy = coords[i][1] - pLat;
          const d = dx * dx + dy * dy;
          if (d < bestD) {
            bestD = d;
            best = i;
          }
        }
        return best;
      };
      const dropIdx = nearestIdx(lon, lat);
      let insertBeforeOrder = filled.length - 1;
      for (let o = 1; o < filled.length; o++) {
        if (nearestIdx(filled[o].lon, filled[o].lat) >= dropIdx) {
          insertBeforeOrder = o;
          break;
        }
      }
      let seen = -1;
      for (let i = 0; i < plan.slots.length; i++) {
        if (plan.slots[i] !== null) {
          seen++;
          if (seen === insertBeforeOrder) return i;
        }
      }
      return plan.slots.length;
    },
    [route, filled, plan.slots],
  );

  // Place a (possibly named) point as start / destination / via.
  const placePoint = useCallback(
    (wpIn: Waypoint, mode: "start" | "dest" | "via") => {
      // Off-grid applies to the incoming leg — meaningless for a start point.
      const wp =
        mode !== "start" && offGridChecked ? { ...wpIn, offGrid: true } : wpIn;
      if (mode === "start") {
        dispatch({ type: "set", index: 0, wp });
      } else if (mode === "dest") {
        dispatch({ type: "set", index: plan.slots.length - 1, wp });
      } else {
        const bracketed = viaSlotIndexFor(wp.lon, wp.lat);
        if (bracketed !== null) {
          dispatch({ type: "insert", index: bracketed, wp });
        } else {
          const firstEmpty = plan.slots.findIndex((s) => s === null);
          if (firstEmpty >= 0) dispatch({ type: "set", index: firstEmpty, wp });
          else dispatch({ type: "insert", index: plan.slots.length, wp });
        }
      }
      setBalloon(null);
      setSelectedHl(null);
      setOffGridChecked(false);
    },
    [plan.slots, viaSlotIndexFor, offGridChecked],
  );

  // Marker drag → move that waypoint
  const handleMarkerDragEnd = useCallback(
    (slotIndex: number, lon: number, lat: number) => {
      dispatch({
        type: "set",
        index: slotIndex,
        wp: { name: `${lat.toFixed(4)}, ${lon.toFixed(4)}`, lon, lat },
      });
      patchName(lon, lat);
    },
    [patchName],
  );

  // Route-line drop → insert a via between the bracketing waypoints
  const handleRouteDrop = useCallback(
    async (lon: number, lat: number) => {
      const slotIndex = viaSlotIndexFor(lon, lat);
      if (slotIndex === null) return;
      dispatch({
        type: "insert",
        index: slotIndex,
        wp: { name: `${lat.toFixed(4)}, ${lon.toFixed(4)}`, lon, lat },
      });
      patchName(lon, lat);
    },
    [viaSlotIndexFor, patchName],
  );

  const buckets = route?.surfaces.buckets;
  const totalSurface = buckets
    ? buckets.paved + buckets.unpaved + buckets.unknown
    : 0;

  const tourPayload: TourPayload | null =
    route && filled.length >= 2
      ? {
          name: `${filled[0].name} - ${filled[filled.length - 1].name}`,
          sport,
          waypoints: filled,
          geometry: route.geometry.geometry,
          elevation: route.elevation,
          stats: route.stats,
          surfaces: route.surfaces,
          waytypes: route.waytypes,
          turns: route.turns ?? [],
        }
      : null;

  const handleLoadTour = useCallback(
    (waypoints: Waypoint[], tourSport: string) => {
      if (isSportClient(tourSport)) setSport(tourSport);
      dispatch({ type: "load", slots: waypoints });
    },
    [],
  );

  return (
    <main className="relative h-dvh w-full">
      <MapView
        route={route?.geometry ?? null}
        waypoints={plan.slots}
        hoverPoint={hoverPoint}
        onMapClick={handleMapClick}
        onMarkerDragEnd={handleMarkerDragEnd}
        onRouteDrop={handleRouteDrop}
        highlights={hlFeatures}
        highlightSegments={hlSegLine}
        onViewportChange={handleViewportChange}
        onHighlightClick={handleHighlightClick}
        savedPlaces={savedFeatures}
        onSavedPlaceClick={handleSavedPlaceClick}
        onMarkerClick={handleMarkerClick}
        viaHandles={viaHandles}
        offGridLines={offGridLines}
        alertLines={alertLines}
        networkOverlays={networks}
        kmMarkers={kmMarkers}
        unpavedLines={unpavedLines}
        emphasisSlot={emphasisSlot}
        balloonAt={balloon}
        balloonContent={
          balloon && (
            <div className="w-56 rounded-xl bg-white/95 p-3 shadow-xl backdrop-blur">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 truncate text-xs font-medium text-neutral-900">
                  {balloon.name}
                </div>
                <button
                  type="button"
                  onClick={() => setBalloon(null)}
                  className="shrink-0 leading-none text-neutral-300 hover:text-neutral-600"
                  aria-label="close"
                >
                  ×
                </button>
              </div>
              {balloon.slotIndex === null ? (
                // Komoot-copied state machine (empirically torn down 2026-07-19):
                //   nothing set    → "set as start" + "set as destination"
                //   start only     → "set as NEW start" + "set as destination"
                //   full route     → "add to route" + "set as NEW destination"
                //                    (no start option — drag marker A instead)
                <div className="mt-2 flex flex-col gap-1">
                  {(() => {
                    const wp = { name: balloon.name, lon: balloon.lon, lat: balloon.lat };
                    const hasStart = plan.slots[0] !== null;
                    const hasDest = plan.slots[plan.slots.length - 1] !== null;
                    const full = hasStart && hasDest;
                    const btn =
                      "flex items-center gap-2 rounded-lg bg-neutral-50 px-2 py-1.5 text-left text-xs hover:bg-emerald-50";
                    const dot = (color: string, label: string) => (
                      <span
                        className="flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold text-white"
                        style={{ backgroundColor: color }}
                      >
                        {label}
                      </span>
                    );
                    return (
                      <>
                        {full && (
                          <button
                            type="button"
                            onClick={() => placePoint(wp, "via")}
                            className={btn}
                          >
                            {dot("#2563eb", "+")}
                            {t("balloon.addVia")}
                          </button>
                        )}
                        {!full && (
                          <button
                            type="button"
                            onClick={() => placePoint(wp, "start")}
                            className={btn}
                          >
                            {dot("#16a34a", "A")}
                            {t(hasStart ? "balloon.newStart" : "balloon.setStart")}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => placePoint(wp, "dest")}
                          className={btn}
                        >
                          {dot("#dc2626", "B")}
                          {t(hasDest ? "balloon.newDest" : "balloon.setDest")}
                        </button>
                      </>
                    );
                  })()}
                  {user && (
                    <button
                      type="button"
                      onClick={toggleSavedPlace}
                      className="flex items-center gap-2 rounded-lg bg-neutral-50 px-2 py-1.5 text-left text-xs hover:bg-amber-50"
                    >
                      <span className="flex h-4 w-4 items-center justify-center text-amber-600">
                        {balloon.savedId ? "★" : "☆"}
                      </span>
                      {balloon.savedId
                        ? t("savedPlaces.remove")
                        : t("savedPlaces.save")}
                    </button>
                  )}
                  {/* Komoot's off-grid toggle: straight line instead of routing */}
                  <button
                    type="button"
                    onClick={() => setOffGridChecked((v) => !v)}
                    className="mt-1 flex items-center gap-2 px-1 text-[11px] text-neutral-500"
                  >
                    <span
                      className={`relative h-3.5 w-6 rounded-full transition ${
                        offGridChecked ? "bg-emerald-600" : "bg-neutral-300"
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 h-2.5 w-2.5 rounded-full bg-white transition-all ${
                          offGridChecked ? "left-3" : "left-0.5"
                        }`}
                      />
                    </span>
                    {t("balloon.offGrid")}
                  </button>
                </div>
              ) : (
                <div className="mt-2 flex flex-col gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      dispatch({ type: "remove", index: balloon.slotIndex! });
                      setBalloon(null);
                    }}
                    className="flex items-center gap-2 rounded-lg bg-neutral-50 px-2 py-1.5 text-left text-xs text-red-700 hover:bg-red-50"
                  >
                    × {t("balloon.remove")}
                  </button>
                </div>
              )}
            </div>
          )
        }
      />

      {/* Map-content panel (GEN-137): layer + category toggles, km markers */}
      <div className="absolute bottom-6 right-4 flex flex-col items-end gap-2">
        {mapContentOpen && (
          <div className="w-60 rounded-2xl bg-white/95 p-3 shadow-xl backdrop-blur">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-neutral-900">
                {t("mapContent.title")}
              </span>
              <button
                type="button"
                onClick={() => setMapContentOpen(false)}
                className="text-neutral-300 hover:text-neutral-600"
                aria-label="close"
              >
                ×
              </button>
            </div>

            <label className="mt-2 flex items-center gap-2 text-xs text-neutral-800">
              <input
                type="checkbox"
                checked={showHl}
                onChange={() => {
                  setShowHl((v) => !v);
                  setSelectedHl(null);
                  setAddingHl(false);
                }}
                className="accent-emerald-700"
              />
              ✦ {t("highlights.toggle")}
            </label>
            {showHl && (
              <div className="ml-5 mt-1 flex flex-col gap-1">
                {HIGHLIGHT_CATEGORIES.filter((c) => (catCounts.get(c) ?? 0) > 0).map(
                  (c) => (
                    <label
                      key={c}
                      className="flex items-center gap-2 text-xs text-neutral-600"
                    >
                      <input
                        type="checkbox"
                        checked={!hiddenCats.has(c)}
                        onChange={() =>
                          setHiddenCats((prev) => {
                            const next = new Set(prev);
                            if (next.has(c)) next.delete(c);
                            else next.add(c);
                            return next;
                          })
                        }
                        className="accent-emerald-700"
                      />
                      {CATEGORY_EMOJI[c]} {t(`highlights.cat.${c}` as never)}
                      <span className="ml-auto text-[10px] text-neutral-400">
                        {catCounts.get(c)}
                      </span>
                    </label>
                  ),
                )}
              </div>
            )}

            <label className="mt-2 flex items-center gap-2 border-t border-neutral-100 pt-2 text-xs text-neutral-800">
              <input
                type="checkbox"
                checked={showKmMarkers}
                onChange={() => setShowKmMarkers((v) => !v)}
                className="accent-emerald-700"
              />
              📏 {t("mapContent.kmMarkers")}
            </label>

            <label className="mt-1 flex items-center gap-2 text-xs text-neutral-800">
              <input
                type="checkbox"
                checked={showUnpaved}
                onChange={() => setShowUnpaved((v) => !v)}
                className="accent-amber-600"
              />
              <span className="inline-block h-1 w-4 rounded bg-amber-600" />
              {t("mapContent.unpaved")}
            </label>

            <div className="mt-2 border-t border-neutral-100 pt-2">
              <span className="text-xs font-medium text-neutral-700">
                {t("mapContent.networks")}
              </span>
              {(["hiking", "cycling", "mtb"] as const).map((net) => (
                <label
                  key={net}
                  className="mt-1 flex items-center gap-2 text-xs text-neutral-600"
                >
                  <input
                    type="checkbox"
                    checked={networks[net]}
                    onChange={() =>
                      setNetworks((prev) => ({ ...prev, [net]: !prev[net] }))
                    }
                    className="accent-emerald-700"
                  />
                  {t(`mapContent.net_${net}` as never)}
                </label>
              ))}
              <p className="mt-1 text-[10px] text-neutral-400">
                © waymarkedtrails.org
              </p>
            </div>

            {user && (
              <label className="mt-2 flex items-center gap-2 text-xs text-neutral-800">
                <input
                  type="checkbox"
                  checked={showSaved}
                  onChange={() => setShowSaved((v) => !v)}
                  className="accent-emerald-700"
                />
                <span className="text-amber-600">★</span>{" "}
                {t("savedPlaces.toggle")}
                <span className="ml-auto text-[10px] text-neutral-400">
                  {savedRows?.length ?? 0}
                </span>
              </label>
            )}

            {user && showHl && (
              <button
                type="button"
                onClick={() => {
                  setAddingHl((v) => !v);
                  setPendingHl(null);
                }}
                className={`mt-2 w-full rounded-lg px-2 py-1.5 text-xs font-medium ${
                  addingHl
                    ? "bg-amber-500 text-white"
                    : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
                }`}
              >
                {addingHl ? t("highlights.clickMap") : `+ ${t("highlights.add")}`}
              </button>
            )}
          </div>
        )}
        <button
          type="button"
          onClick={() => setMapContentOpen((v) => !v)}
          className={`rounded-full px-3 py-1.5 text-xs font-medium shadow-lg ${
            mapContentOpen
              ? "bg-emerald-700 text-white"
              : "bg-white/95 text-neutral-700 hover:bg-white"
          }`}
        >
          🗺 {t("mapContent.button")}
        </button>
      </div>

      {/* Selected highlight card */}
      {selectedHl && (
        <div className="absolute top-16 z-20 rounded-2xl bg-white/95 p-4 shadow-xl backdrop-blur max-md:left-2 max-md:right-16 md:right-16 md:w-72">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="font-medium text-neutral-900">
                {CATEGORY_EMOJI[selectedHl.category] ?? "📍"} {selectedHl.name}
              </div>
              <div className="text-xs capitalize text-neutral-500">
                {t(`highlights.cat.${selectedHl.category}` as never)}
                {" · "}
                <a
                  href={`/${locale}/highlight/${selectedHl.id}`}
                  className="normal-case text-emerald-700 hover:underline"
                >
                  {t("highlights.viewPage")} ↗
                </a>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSelectedHl(null)}
              className="shrink-0 text-neutral-300 hover:text-neutral-600"
              aria-label="close"
            >
              ×
            </button>
          </div>
          {selectedHl.description && (
            <p className="mt-2 max-h-24 overflow-y-auto text-xs leading-relaxed text-neutral-600">
              {selectedHl.description}
            </p>
          )}
          <div className="mt-3 flex items-center justify-between">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => voteHl(1)}
                disabled={!user}
                title={user ? "" : t("highlights.loginToVote")}
                className={`rounded-lg px-2 py-1 text-sm disabled:opacity-30 ${
                  myVote === 1 ? "bg-emerald-100 text-emerald-800" : "bg-neutral-100 hover:bg-neutral-200"
                }`}
              >
                ▲
              </button>
              <span className="min-w-6 text-center text-sm font-medium text-neutral-700">
                {hlScore ?? "…"}
              </span>
              <button
                type="button"
                onClick={() => voteHl(-1)}
                disabled={!user}
                className={`rounded-lg px-2 py-1 text-sm disabled:opacity-30 ${
                  myVote === -1 ? "bg-red-100 text-red-800" : "bg-neutral-100 hover:bg-neutral-200"
                }`}
              >
                ▼
              </button>
            </div>
            {user && (
              <button
                type="button"
                onClick={saveHighlightAsPlace}
                title={t("savedPlaces.save")}
                className="rounded-lg bg-neutral-100 px-2 py-1 text-sm text-amber-600 hover:bg-amber-50"
              >
                ☆
              </button>
            )}
            <div className="flex items-center gap-1" title={t("highlights.asWaypoint")}>
              <button
                type="button"
                onClick={() =>
                  placePoint(
                    { name: selectedHl.name, lon: selectedHl.lon, lat: selectedHl.lat },
                    "start",
                  )
                }
                className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#16a34a] text-xs font-bold text-white hover:opacity-90"
              >
                A
              </button>
              <button
                type="button"
                onClick={() =>
                  placePoint(
                    { name: selectedHl.name, lon: selectedHl.lon, lat: selectedHl.lat },
                    "dest",
                  )
                }
                className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#dc2626] text-xs font-bold text-white hover:opacity-90"
              >
                B
              </button>
              <button
                type="button"
                onClick={() =>
                  placePoint(
                    { name: selectedHl.name, lon: selectedHl.lon, lat: selectedHl.lat },
                    "via",
                  )
                }
                className="rounded-lg bg-emerald-700 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-800"
              >
                + {t("highlights.asWaypoint")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New-highlight mini form */}
      {pendingHl && (
        <div className="absolute top-16 z-20 rounded-2xl bg-white/95 p-4 shadow-xl backdrop-blur max-md:left-2 max-md:right-16 md:right-16 md:w-72">
          <div className="text-sm font-medium text-neutral-900">
            {t("highlights.newTitle")}
          </div>
          <input
            value={newHlName}
            onChange={(e) => setNewHlName(e.target.value)}
            placeholder={t("highlights.namePlaceholder")}
            className="mt-2 w-full rounded-lg border border-neutral-200 px-2 py-1.5 text-sm"
          />
          <div className="mt-2 flex flex-wrap gap-1">
            {HIGHLIGHT_CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setNewHlCat(c)}
                className={`rounded-full px-2 py-0.5 text-[11px] ${
                  newHlCat === c
                    ? "bg-emerald-700 text-white"
                    : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                }`}
              >
                {CATEGORY_EMOJI[c]} {t(`highlights.cat.${c}` as never)}
              </button>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={createHighlight}
              disabled={!newHlName.trim()}
              className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
            >
              {t("highlights.save")}
            </button>
            <button
              type="button"
              onClick={() => setPendingHl(null)}
              className="text-xs text-neutral-400 hover:text-neutral-700"
            >
              {t("highlights.cancel")}
            </button>
          </div>
        </div>
      )}

      {segOpen && (
        <div className="absolute top-16 z-20 rounded-2xl bg-white/95 p-4 shadow-xl backdrop-blur max-md:left-2 max-md:right-16 md:right-16 md:w-72">
          <div className="text-sm font-medium text-neutral-900">
            {t("highlights.newSegmentTitle")}
          </div>
          <input
            value={segName}
            onChange={(e) => setSegName(e.target.value)}
            placeholder={t("highlights.namePlaceholder")}
            className="mt-2 w-full rounded-lg border border-neutral-200 px-2 py-1.5 text-sm"
          />
          <div className="mt-2 flex flex-wrap gap-1">
            {HIGHLIGHT_CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setSegCat(c)}
                className={`rounded-full px-2 py-0.5 text-[11px] ${
                  segCat === c
                    ? "bg-emerald-700 text-white"
                    : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                }`}
              >
                {CATEGORY_EMOJI[c]} {t(`highlights.cat.${c}` as never)}
              </button>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={createSegment}
              disabled={!segName.trim()}
              className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
            >
              {t("highlights.save")}
            </button>
            <button
              type="button"
              onClick={() => setSegOpen(false)}
              className="text-xs text-neutral-400 hover:text-neutral-700"
            >
              {t("highlights.cancel")}
            </button>
          </div>
        </div>
      )}

      {/* Desktop: floating left panel. Mobile: bottom sheet so the map stays visible. */}
      <div
        className={`absolute flex flex-col gap-3 overflow-y-auto rounded-2xl bg-white/95 p-4 shadow-xl backdrop-blur max-md:inset-x-2 max-md:bottom-2 md:left-4 md:top-16 md:max-h-[calc(100dvh-5rem)] md:w-[340px] ${
          sheetCollapsed
            ? route
              ? // ingeklapt mét route: hoger, zodat de mini-samenvatting bóven
                // de MapLibre-attributiestrook valt (zelfde reden als TourView)
                "max-md:max-h-[7rem] max-md:overflow-hidden"
              : "max-md:max-h-[3.75rem] max-md:overflow-hidden"
            : "max-md:max-h-[45dvh]"
        }`}
      >
        {/* Mobile grab-handle: tap to collapse/expand the sheet and reclaim the
            map. Hidden on desktop where the panel is a fixed sidebar. */}
        <button
          type="button"
          onClick={() => setSheetCollapsed((v) => !v)}
          aria-expanded={!sheetCollapsed}
          aria-label={sheetCollapsed ? t("expandPanel") : t("collapsePanel")}
          className="mx-auto -mt-1 mb-1 flex h-5 w-full items-center justify-center md:hidden"
        >
          <span className="h-1.5 w-10 rounded-full bg-neutral-300" />
        </button>
        {/* Ingeklapte peek: toon de kerncijfers van de berekende route, zodat je
            de kaart kunt verkennen zónder afstand/tijd/klim/moeilijkheid kwijt te
            raken. Alleen mobiel + alleen ingeklapt + alleen met route. */}
        {sheetCollapsed && route && (
          <div className="flex items-center gap-2 text-xs md:hidden">
            <span className="shrink-0 font-semibold text-neutral-900">
              {fmtKm(route.stats.distanceM)} km
            </span>
            <span className="shrink-0 text-neutral-500">
              {fmtTime(route.stats.timeS)}
            </span>
            <span className="shrink-0 text-neutral-500">
              ↗ {route.stats.ascendM} m
            </span>
            {(() => {
              const d = difficulty(
                sport,
                route.stats.distanceM,
                route.stats.ascendM,
              );
              return (
                <span
                  className={`ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    d === "easy"
                      ? "bg-emerald-100 text-emerald-800"
                      : d === "moderate"
                        ? "bg-amber-100 text-amber-800"
                        : "bg-red-100 text-red-800"
                  }`}
                >
                  {t(`difficultyLabels.${d}`)}
                </span>
              );
            })()}
          </div>
        )}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-lg font-semibold text-neutral-900">
              {t("title")}
            </h1>
            <p className="text-xs text-neutral-500">{t("tagline")}</p>
          </div>
          <div className="flex gap-1">
            <button
              type="button"
              title={t("undo")}
              onClick={() => dispatch({ type: "undo" })}
              disabled={plan.past.length === 0}
              className="rounded-lg bg-neutral-100 px-2 py-1 text-sm hover:bg-neutral-200 disabled:opacity-30"
            >
              ↶
            </button>
            <button
              type="button"
              title={t("redo")}
              onClick={() => dispatch({ type: "redo" })}
              disabled={plan.future.length === 0}
              className="rounded-lg bg-neutral-100 px-2 py-1 text-sm hover:bg-neutral-200 disabled:opacity-30"
            >
              ↷
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-1">
          {SPORTS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSport(s)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                sport === s
                  ? "bg-emerald-700 text-white"
                  : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
              }`}
            >
              {t(`sports.${s}`)}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-2">
          {plan.slots.map((slot, i) => {
            const last = plan.slots.length - 1;
            // Komoot badge scheme: A (start) / 1,2,… (vias) / B (destination);
            // a loop's trailing start-copy shows as a green A again.
            const badge =
              i === 0 || (isLoop && i === last)
                ? "A"
                : i === last
                  ? "B"
                  : String(i);
            const badgeColor =
              i === 0 || (isLoop && i === last)
                ? "#16a34a"
                : i === last
                  ? "#dc2626"
                  : "#2563eb";
            return (
              <div
                key={i}
                onMouseEnter={() => setEmphasisSlot(i)}
                onMouseLeave={() => setEmphasisSlot(null)}
              >
                <SearchField
                  placeholder={
                    i === 0 ? t("start") : i === last ? t("destination") : t("via")
                  }
                  badge={badge}
                  badgeColor={badgeColor}
                  value={slot}
                  onSelect={(wp) => dispatch({ type: "set", index: i, wp })}
                  onRemove={
                    plan.slots.length > 2 || slot !== null
                      ? () => dispatch({ type: "remove", index: i })
                      : undefined
                  }
                  onMoveUp={
                    i > 0 ? () => dispatch({ type: "swap", a: i, b: i - 1 }) : undefined
                  }
                  onMoveDown={
                    i < last ? () => dispatch({ type: "swap", a: i, b: i + 1 }) : undefined
                  }
                  onRename={(name) =>
                    slot && dispatch({ type: "set", index: i, wp: { ...slot, name } })
                  }
                  actionLabels={{
                    remove: t("rowActions.remove"),
                    up: t("rowActions.up"),
                    down: t("rowActions.down"),
                    rename: t("rowActions.rename"),
                  }}
                />
              </div>
            );
          })}
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => dispatch({ type: "append" })}
              disabled={plan.slots.length >= 10}
              className="text-xs text-emerald-700 hover:underline disabled:text-neutral-300"
            >
              + {t("addWaypoint")}
            </button>
            <button
              type="button"
              onClick={() => dispatch({ type: "reverse" })}
              disabled={filled.length < 2}
              className="text-xs text-emerald-700 hover:underline disabled:text-neutral-300"
            >
              ⇅ {t("reverse")}
            </button>
          </div>
          {/* Komoot's "Heen en terug": route your planned trip back to the start */}
          {filled.length >= 2 && (
            <button
              type="button"
              onClick={toggleRoundTrip}
              className="flex items-center gap-2 self-start text-xs text-neutral-700"
            >
              <span
                className={`relative h-4 w-7 rounded-full transition ${
                  isLoop ? "bg-emerald-600" : "bg-neutral-300"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${
                    isLoop ? "left-3.5" : "left-0.5"
                  }`}
                />
              </span>
              {t("roundTripToggle")}
            </button>
          )}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setRtOpen((v) => !v)}
              className={`text-xs ${rtOpen ? "font-semibold text-emerald-800" : "text-emerald-700"} hover:underline`}
            >
              ⟳ {t("roundTrip")}
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="text-xs text-emerald-700 hover:underline"
            >
              ⤒ {t("importGpx")}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".gpx,application/gpx+xml"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleImportFile(f);
                e.target.value = "";
              }}
            />
          </div>
          {rtOpen && (
            <div className="flex items-center gap-2 rounded-lg bg-neutral-50 p-2">
              <input
                type="number"
                min={5}
                max={200}
                value={rtTargetKm}
                onChange={(e) => setRtTargetKm(Number(e.target.value))}
                className="w-16 rounded border border-neutral-200 px-2 py-1 text-xs"
              />
              <span className="text-xs text-neutral-500">km</span>
              <button
                type="button"
                onClick={handleGenerateLoop}
                disabled={rtBusy || filled.length !== 1}
                className="rounded-lg bg-emerald-700 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-800 disabled:opacity-40"
              >
                {rtBusy ? t("generating") : t("generate")}
              </button>
              {!filled[0] && (
                <span className="text-[10px] text-neutral-400">
                  {t("roundTripHint")}
                </span>
              )}
              {filled.length > 1 && (
                <span className="text-[10px] text-neutral-400">
                  {t("roundTripOnlyStart")}
                </span>
              )}
            </div>
          )}
          <p className="text-[11px] text-neutral-400">{t("mapHint")}</p>
        </div>

        {loading && (
          <p className="text-sm text-neutral-500">{t("calculating")}</p>
        )}
        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {[
              "no_route",
              "router_unavailable",
              "rate_limited",
              "gpx_invalid",
              "roundtrip_needs_start",
            ].includes(error)
              ? t(`errors.${error}` as never)
              : t("errors.generic")}
          </p>
        )}

        {route && !loading && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                  difficulty(sport, route.stats.distanceM, route.stats.ascendM) ===
                  "easy"
                    ? "bg-emerald-100 text-emerald-800"
                    : difficulty(
                          sport,
                          route.stats.distanceM,
                          route.stats.ascendM,
                        ) === "moderate"
                      ? "bg-amber-100 text-amber-800"
                      : "bg-red-100 text-red-800"
                }`}
              >
                {t(
                  `difficultyLabels.${difficulty(sport, route.stats.distanceM, route.stats.ascendM)}`,
                )}
              </span>
              <div className="flex items-center gap-2">
                {climbs.length > 0 && (
                  <span className="text-[11px] text-neutral-500">
                    {t("climbsCount", { count: climbs.length })}
                  </span>
                )}
                <ExportMenu
                  compact
                  getData={() => ({
                    name:
                      filled.length >= 2
                        ? `${filled[0].name} - ${filled[filled.length - 1].name}`
                        : "route",
                    sport,
                    coords: routeCoords ?? [],
                    elevation: route?.elevation ?? [],
                    waypoints: filled,
                    durationS: route?.stats.timeS ?? 3600,
                    turns: route?.turns ?? [],
                  })}
                />
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="rounded-lg bg-neutral-100 px-2 py-1 text-[11px] font-medium text-neutral-700 hover:bg-neutral-200"
                >
                  {copied ? t("copied") : `⧉ ${t("share")}`}
                </button>
                {user && (
                  <button
                    type="button"
                    onClick={() => setSegOpen(true)}
                    title={t("highlights.saveSegmentHint")}
                    className="rounded-lg bg-neutral-100 px-2 py-1 text-[11px] font-medium text-neutral-700 hover:bg-neutral-200"
                  >
                    ✚ {t("highlights.saveSegment")}
                  </button>
                )}
              </div>
            </div>
            <div className="grid grid-cols-4 gap-2 text-center">
              <div>
                <div className="text-base font-semibold">
                  {fmtKm(route.stats.distanceM)}
                </div>
                <div className="text-[10px] uppercase text-neutral-500">km</div>
              </div>
              <div>
                <div className="text-base font-semibold">
                  {fmtTime(route.stats.timeS)}
                </div>
                <div className="text-[10px] uppercase text-neutral-500">
                  {t("time")}
                </div>
              </div>
              <div>
                <div className="text-base font-semibold">
                  ↗ {route.stats.ascendM}
                </div>
                <div className="text-[10px] uppercase text-neutral-500">m</div>
              </div>
              <div>
                <div className="text-base font-semibold">
                  ↘ {route.stats.descendM}
                </div>
                <div className="text-[10px] uppercase text-neutral-500">m</div>
              </div>
            </div>

            {/* GEN-129: access warnings — static restrictions only */}
            {route.alerts && route.alerts.length > 0 && distances && (
              <div className="flex flex-col gap-1">
                {route.alerts.map((a, i) => (
                  <button
                    key={i}
                    type="button"
                    onMouseEnter={() => setHoverIdx(a.fromIdx)}
                    onMouseLeave={() => setHoverIdx(null)}
                    className="flex items-center justify-between rounded-lg bg-red-50 px-2 py-1 text-left text-[11px] text-red-900 hover:bg-red-100"
                  >
                    <span>
                      ⚠ {t(`alerts.${a.kind}` as never)} ·{" "}
                      {a.distanceM >= 1000
                        ? `${(a.distanceM / 1000).toFixed(1)} km`
                        : `${a.distanceM} m`}
                    </span>
                    <span className="text-red-400">
                      {t("atKm")} {((distances[a.fromIdx] ?? 0) / 1000).toFixed(1)}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {distances && (
              <ElevationChart
                elevation={route.elevation}
                distances={distances}
                climbs={climbs}
                onHover={setHoverIdx}
              />
            )}
            {distances && <GradeLegend />}

            {climbs.length > 0 && distances && (
              <div className="flex flex-col gap-1">
                {climbs.map((c, i) => (
                  <button
                    key={i}
                    type="button"
                    onMouseEnter={() => setHoverIdx(c.startIdx)}
                    onMouseLeave={() => setHoverIdx(null)}
                    className="flex items-center justify-between rounded-lg bg-orange-50 px-2 py-1 text-left text-[11px] text-orange-900 hover:bg-orange-100"
                  >
                    <span>
                      ⛰ {t("climb")} {i + 1} · {t("atKm")}{" "}
                      {(c.startM / 1000).toFixed(1)}
                    </span>
                    <span className="font-medium">
                      {(c.lengthM / 1000).toFixed(1)} km · ↗{Math.round(c.gainM)} m
                      · {c.avgPct.toFixed(1)}%
                    </span>
                  </button>
                ))}
              </div>
            )}

            {buckets && totalSurface > 0 && (
              <div>
                <div className="mb-1 text-xs font-medium text-neutral-700">
                  {t("surfaces")}
                </div>
                <div className="flex h-2 w-full overflow-hidden rounded-full">
                  <div
                    className="bg-blue-600"
                    style={{ width: `${(buckets.paved / totalSurface) * 100}%` }}
                  />
                  <div
                    className="bg-amber-500"
                    style={{ width: `${(buckets.unpaved / totalSurface) * 100}%` }}
                  />
                  <div
                    className="bg-neutral-300"
                    style={{ width: `${(buckets.unknown / totalSurface) * 100}%` }}
                  />
                </div>
                <div className="mt-1 flex gap-3 text-[11px] text-neutral-600">
                  <span>
                    ■ {t("paved")} {Math.round((buckets.paved / totalSurface) * 100)}%
                  </span>
                  <span>
                    ■ {t("unpaved")}{" "}
                    {Math.round((buckets.unpaved / totalSurface) * 100)}%
                  </span>
                  <span>
                    ■ {t("unknown")}{" "}
                    {Math.round((buckets.unknown / totalSurface) * 100)}%
                  </span>
                </div>
              </div>
            )}

            <details className="text-xs">
              <summary className="cursor-pointer font-medium text-neutral-700">
                {t("details")}
              </summary>
              <div className="mt-2 grid grid-cols-2 gap-3">
                <div>
                  <div className="mb-1 font-medium text-neutral-600">
                    {t("waytypes")}
                  </div>
                  {groupWaytypes(route.waytypes).map(([k, v]) => (
                    <div key={k} className="flex justify-between text-neutral-600">
                      <span>{t(`wt.${k}` as never)}</span>
                      <span>{fmtKm(v)} km</span>
                    </div>
                  ))}
                </div>
                <div>
                  <div className="mb-1 font-medium text-neutral-600">
                    {t("surfacesDetail")}
                  </div>
                  {groupSurfaces(route.surfaces.detailM).map(([k, v]) => (
                    <div key={k} className="flex justify-between text-neutral-600">
                      <span>{t(`sf.${k}` as never)}</span>
                      <span>{fmtKm(v)} km</span>
                    </div>
                  ))}
                </div>
              </div>
            </details>
          </div>
        )}

        <AccountPanel tour={tourPayload} onLoadTour={handleLoadTour} hideLoginForm />
      </div>
    </main>
  );
}
