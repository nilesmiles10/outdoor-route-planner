"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { useTranslations } from "next-intl";
import MapView, { type Waypoint } from "./MapView";
import SearchField from "./SearchField";
import ElevationChart from "./ElevationChart";
import { cumulativeDistances, detectClimbs } from "@/lib/elevation";
import { buildGpx, parseGpx, sampleAnchors } from "@/lib/gpx";
import { loopVias } from "@/lib/roundtrip";

const SPORTS = ["hike", "run", "touring", "gravel", "mtb", "road", "ebike"] as const;
type Sport = (typeof SPORTS)[number];

type RouteResult = {
  geometry: GeoJSON.Feature;
  stats: { distanceM: number; timeS: number; ascendM: number; descendM: number };
  surfaces: {
    buckets: { paved: number; unpaved: number; unknown: number };
    detailM: Record<string, number>;
  };
  waytypes: Record<string, number>;
  elevation: number[];
};

type Slots = (Waypoint | null)[];
type PlanState = { slots: Slots; past: Slots[]; future: Slots[] };
type PlanAction =
  | { type: "set"; index: number; wp: Waypoint | null }
  | { type: "insert"; index: number; wp: Waypoint }
  | { type: "append" }
  | { type: "remove"; index: number }
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

function fmtKm(m: number) {
  return (m / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 });
}

// Difficulty formula (documented, GEN-106):
//   bike: effort = km + ascent/50   ("100 m climbing ≈ 2 extra km")
//   foot: effort = km + ascent/100  (walking absorbs climbs relatively better
//                                    per km, but thresholds are much lower)
// Calibration reference (2026-07-19): Utrecht→Amersfoort touring
// (21.6 km/32 m → easy, matches Komoot), La Roche→Houffalize touring
// (27.9 km/442 m → moderate), Den Haag→Utrecht (66 km → moderate).
function difficulty(
  sport: Sport,
  distanceM: number,
  ascendM: number,
): "easy" | "moderate" | "hard" {
  const onFoot = sport === "hike" || sport === "run";
  const effort = distanceM / 1000 + ascendM / (onFoot ? 100 : 50);
  const [easyMax, moderateMax] = onFoot ? [10, 20] : [30, 70];
  if (effort <= easyMax) return "easy";
  if (effort <= moderateMax) return "moderate";
  return "hard";
}

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
  legs.forEach((leg, i) => {
    const legCoords = (leg.geometry.geometry as GeoJSON.LineString).coordinates;
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
  };
}

export default function PlannerApp() {
  const t = useTranslations("planner");
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


  const filled = plan.slots.filter((s): s is Waypoint => s !== null);

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
      setRoute(legs.length === 1 ? legs[0] : mergeLegs(legs));
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

  // Keyboard undo/redo
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        dispatch({ type: e.shiftKey ? "redo" : "undo" });
      }
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
    const w = params.get("w");
    if (!w) return;
    const pts = w
      .split(";")
      .map((p) => p.split(",").map(Number))
      .filter((p) => p.length === 2 && p.every(Number.isFinite));
    if (pts.length < 2) return;
    const s = params.get("sport");
    if (s && isSportClient(s)) setSport(s);
    dispatch({
      type: "load",
      slots: pts.map(([lon, lat]) => ({ name: coordName(lon, lat), lon, lat })),
    });
    pts.forEach(([lon, lat]) => patchName(lon, lat));
  }, [patchName]);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (filled.length >= 2) {
      url.searchParams.set(
        "w",
        filled.map((p) => `${p.lon.toFixed(5)},${p.lat.toFixed(5)}`).join(";"),
      );
      url.searchParams.set("sport", sport);
    } else {
      url.searchParams.delete("w");
      url.searchParams.delete("sport");
    }
    window.history.replaceState(null, "", url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(filled), sport]);

  // --- GPX export/import (GEN-108) ---
  const handleDownloadGpx = useCallback(() => {
    if (!route || !routeCoords) return;
    const name =
      filled.length >= 2
        ? `${filled[0].name} - ${filled[filled.length - 1].name}`
        : "route";
    const gpx = buildGpx(name, routeCoords, route.elevation, filled);
    const blob = new Blob([gpx], { type: "application/gpx+xml" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${name.replace(/[^\w\- ]+/g, "").slice(0, 60) || "route"}.gpx`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [route, routeCoords, filled]);

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

  // Map click → fill first empty slot, else append at the end
  const handleMapClick = useCallback(
    (lon: number, lat: number) => {
      const wp = { name: `${lat.toFixed(4)}, ${lon.toFixed(4)}`, lon, lat };
      const firstEmpty = plan.slots.findIndex((s) => s === null);
      if (firstEmpty >= 0) dispatch({ type: "set", index: firstEmpty, wp });
      else dispatch({ type: "insert", index: plan.slots.length, wp });
      patchName(lon, lat);
    },
    [plan.slots, patchName],
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
      if (!route || filled.length < 2) return;
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
      // Find the first waypoint (in route order) that lies beyond the drop.
      let insertBeforeOrder = filled.length - 1;
      for (let o = 1; o < filled.length; o++) {
        if (nearestIdx(filled[o].lon, filled[o].lat) >= dropIdx) {
          insertBeforeOrder = o;
          break;
        }
      }
      // Map order-index back to slot-index
      let seen = -1;
      let slotIndex = plan.slots.length;
      for (let i = 0; i < plan.slots.length; i++) {
        if (plan.slots[i] !== null) {
          seen++;
          if (seen === insertBeforeOrder) {
            slotIndex = i;
            break;
          }
        }
      }
      dispatch({
        type: "insert",
        index: slotIndex,
        wp: { name: `${lat.toFixed(4)}, ${lon.toFixed(4)}`, lon, lat },
      });
      patchName(lon, lat);
    },
    [route, filled, plan.slots, patchName],
  );

  const buckets = route?.surfaces.buckets;
  const totalSurface = buckets
    ? buckets.paved + buckets.unpaved + buckets.unknown
    : 0;

  return (
    <main className="relative h-dvh w-full">
      <MapView
        route={route?.geometry ?? null}
        waypoints={plan.slots}
        hoverPoint={hoverPoint}
        onMapClick={handleMapClick}
        onMarkerDragEnd={handleMarkerDragEnd}
        onRouteDrop={handleRouteDrop}
      />

      <div className="absolute left-4 top-4 flex w-[340px] max-h-[calc(100dvh-2rem)] flex-col gap-3 overflow-y-auto rounded-2xl bg-white/95 p-4 shadow-xl backdrop-blur">
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
          {plan.slots.map((slot, i) => (
            <SearchField
              key={i}
              placeholder={
                i === 0
                  ? t("start")
                  : i === plan.slots.length - 1
                    ? t("destination")
                    : t("via")
              }
              badge={String.fromCharCode(65 + i)}
              badgeColor={
                i === 0 ? "#16a34a" : i === plan.slots.length - 1 ? "#dc2626" : "#2563eb"
              }
              value={slot}
              onSelect={(wp) => dispatch({ type: "set", index: i, wp })}
              onRemove={
                plan.slots.length > 2
                  ? () => dispatch({ type: "remove", index: i })
                  : undefined
              }
            />
          ))}
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
                disabled={rtBusy || !filled[0]}
                className="rounded-lg bg-emerald-700 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-800 disabled:opacity-40"
              >
                {rtBusy ? t("generating") : t("generate")}
              </button>
              {!filled[0] && (
                <span className="text-[10px] text-neutral-400">
                  {t("roundTripHint")}
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
                    {climbs.length} {t("climbs")}
                  </span>
                )}
                <button
                  type="button"
                  onClick={handleDownloadGpx}
                  className="rounded-lg bg-neutral-100 px-2 py-1 text-[11px] font-medium text-neutral-700 hover:bg-neutral-200"
                >
                  ⤓ GPX
                </button>
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="rounded-lg bg-neutral-100 px-2 py-1 text-[11px] font-medium text-neutral-700 hover:bg-neutral-200"
                >
                  {copied ? t("copied") : `⧉ ${t("share")}`}
                </button>
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

            {distances && (
              <ElevationChart
                elevation={route.elevation}
                distances={distances}
                climbs={climbs}
                onHover={setHoverIdx}
              />
            )}

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
      </div>
    </main>
  );
}
