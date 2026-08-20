"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { mapStyle, attachBasemapFallback } from "@/lib/mapStyle";
import { CATEGORY_COLOR } from "@/lib/highlights";

// offGrid: the leg ARRIVING at this waypoint is a straight (unrouted) line.
export type Waypoint = { name: string; lon: number; lat: number; offGrid?: boolean };

export type HighlightClick = {
  id: string;
  name: string;
  category: string;
  description: string;
  lon: number;
  lat: number;
};

const BADGE_COLORS = ["#16a34a", "#dc2626", "#2563eb", "#9333ea", "#ea580c"];
export function waypointColor(i: number, count: number) {
  if (i === 0) return BADGE_COLORS[0];
  if (i === count - 1) return BADGE_COLORS[1];
  return BADGE_COLORS[2 + ((i - 1) % 3)];
}

type Props = {
  route: GeoJSON.Feature | null;
  // Planner-only: laatst-bekeken camera (uit localStorage) zodat een terugkerende
  // gebruiker verdergaat waar hij was i.p.v. elke keer op de Utrecht-default te
  // landen. Alleen gebruikt bij mount én alleen wanneer er geen route-bounds zijn
  // (tour/trail overschrijven dit met fitBounds op de eigen geometrie).
  initialView?: { center: [number, number]; zoom: number } | null;
  waypoints: (Waypoint | null)[];
  hoverPoint: GeoJSON.Position | null;
  // Cursor over de route-lijn → dichtstbijzijnde route-index (of null bij
  // verlaten). Voedt de elevation-marker zodat kaart↔profiel tweerichtings
  // linken. Optioneel (TourView geeft dit niet door).
  onRouteHover?: (idx: number | null) => void;
  // Imperatief camera-focus-verzoek: klik op een waarschuwing/klim → vlieg naar
  // dat punt op de route. `n` is een teller zodat hetzelfde punt twee keer
  // aanklikken opnieuw triggert (zelfde coord = zelfde prop-waarde). Optioneel.
  focusPoint?: { lon: number; lat: number; n: number } | null;
  onMapClick: (lon: number, lat: number) => void;
  onMarkerDragEnd: (slotIndex: number, lon: number, lat: number) => void;
  onRouteDrop: (lon: number, lat: number) => void;
  // GEN-115: community-POI layer (optional — TourView doesn't pass these).
  highlights?: GeoJSON.FeatureCollection | null;
  highlightSegments?: GeoJSON.FeatureCollection | null;
  onHighlightClick?: (h: HighlightClick) => void;
  // Viewport (na moveend) zodat de highlight-laag per kaartbeeld kan laden
  // i.p.v. "alles in één keer" — met honderdduizenden punten kan dat niet.
  onViewportChange?: (
    bounds: { w: number; s: number; e: number; n: number },
    zoom: number,
  ) => void;
  savedPlaces?: GeoJSON.FeatureCollection | null;
  onSavedPlaceClick?: (p: { id: string; name: string; lon: number; lat: number }) => void;
  // Komoot-style click balloon: anchor position + React content, rendered
  // as an overlay that tracks the map camera. Optional (TourView skips it).
  balloonAt?: { lon: number; lat: number } | null;
  balloonContent?: React.ReactNode;
  // Click on an existing waypoint marker (to open its remove/edit balloon).
  onMarkerClick?: (slotIndex: number) => void;
  // GEN-141: visible midpoint grab-handles per leg (A1), dashed off-grid
  // legs (A4), and panel-hover marker emphasis (A6).
  viaHandles?: GeoJSON.FeatureCollection | null;
  offGridLines?: GeoJSON.FeatureCollection | null;
  alertLines?: GeoJSON.FeatureCollection | null;
  unpavedLines?: GeoJSON.FeatureCollection | null;
  networkOverlays?: { hiking: boolean; cycling: boolean; mtb: boolean };
  // GEN-137: distance markers along the route (every 5/10 km).
  kmMarkers?: GeoJSON.FeatureCollection | null;
  emphasisSlot?: number | null;
  // GeolocateControl fired: de gebruiker liet zich lokaliseren. De planner kan
  // dit gebruiken om "plan vanaf mijn locatie" te doen (start zetten bij lege
  // route). TourView laat dit weg.
  onGeolocate?: (lon: number, lat: number) => void;
};

export default function MapView({
  route,
  initialView,
  waypoints,
  hoverPoint,
  onRouteHover,
  focusPoint,
  onMapClick,
  onMarkerDragEnd,
  onRouteDrop,
  highlights,
  highlightSegments,
  onHighlightClick,
  onViewportChange,
  savedPlaces,
  onSavedPlaceClick,
  balloonAt,
  balloonContent,
  onMarkerClick,
  viaHandles,
  offGridLines,
  alertLines,
  unpavedLines,
  networkOverlays,
  kmMarkers,
  emphasisSlot,
  onGeolocate,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<Map<number, maplibregl.Marker>>(new Map());
  // Latest route coordinates for the fit-route control (set by the sync effect).
  const routeCoordsRef = useRef<GeoJSON.Position[] | null>(null);
  const [ready, setReady] = useState(false);
  const [balloonXY, setBalloonXY] = useState<{ x: number; y: number } | null>(null);
  // Keep latest callbacks without re-binding map listeners.
  const cbRef = useRef({
    onMapClick,
    onMarkerDragEnd,
    onRouteDrop,
    onHighlightClick,
    onSavedPlaceClick,
    onMarkerClick,
    onViewportChange,
    onRouteHover,
    onGeolocate,
  });
  cbRef.current = {
    onMapClick,
    onMarkerDragEnd,
    onRouteDrop,
    onHighlightClick,
    onSavedPlaceClick,
    onMarkerClick,
    onViewportChange,
    onRouteHover,
    onGeolocate,
  };

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    // Init meteen op de route-bounds (tour/trail) i.p.v. eerst Utrecht tonen en
    // dan wegspringen: routes ver van Utrecht flitsten het verkeerde gebied +
    // een camera-sprong. De planner (route == null) houdt de Utrecht-default.
    const initCoords =
      route?.geometry && (route.geometry as GeoJSON.LineString).type === "LineString"
        ? (route.geometry as GeoJSON.LineString).coordinates
        : null;
    const initBounds =
      initCoords && initCoords.length >= 2
        ? initCoords.reduce(
            (acc, c) => acc.extend([c[0], c[1]]),
            new maplibregl.LngLatBounds(
              [initCoords[0][0], initCoords[0][1]],
              [initCoords[0][0], initCoords[0][1]],
            ),
          )
        : null;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: mapStyle(),
      ...(initBounds
        ? { bounds: initBounds, fitBoundsOptions: { padding: 60 } }
        : initialView
          ? { center: initialView.center, zoom: initialView.zoom } // hervat laatst-bekeken
          : { center: [5.1214, 52.0907], zoom: 8 }), // Utrecht (planner-default)
    });
    // If the primary basemap never loads (OpenFreeMap has stalled repeatedly),
    // fail over once to the self-hosted tiles. Overlay layers re-add themselves
    // on the resulting styledata event (see initLayers below).
    attachBasemapFallback(map);
    // Surface style/source failures instead of silently showing a blank map —
    // the OpenFreeMap stalls and the pmtiles switch both failed this way.
    map.on("error", (e) => {
      console.error("[map]", (e as { error?: Error }).error?.message ?? e);
    });
    // Compacte attributie op smalle schermen inklappen tot de ⓘ-knop. MapLibre
    // _updateCompact() voegt op mobiel (<=640px) automatisch `compact-show` toe
    // (uitgeklapt); die 2-regelige tekst overlapte de bottom-sheet (Tip-regel
    // onleesbaar). We kunnen niet op 'load'/'idle' wachten — bij stallende
    // tiles komen die events nooit — dus een kortlevende observer haalt
    // `compact-show` weg zodra MapLibre 'm (opnieuw) zet, tot de gebruiker de
    // ⓘ zelf opent of de load/resize-churn is uitgewerkt. Juridisch correct:
    // tik op ⓘ toont de volledige bronvermelding.
    const attribRoot = map.getContainer();
    let attribPinned = false; // true zodra de gebruiker de attributie opent
    const minimizeAttrib = () => {
      // Alleen op smalle (mobiele) viewports inklappen — op desktop is er ruimte
      // voor de volledige bronvermelding, dus laat die met rust. 640px matcht
      // MapLibre's eigen compact-drempel.
      if (attribPinned || window.innerWidth > 640) return;
      attribRoot
        .querySelector(".maplibregl-ctrl-attrib.maplibregl-compact-show")
        ?.classList.remove("maplibregl-compact-show");
    };
    const attribObs = new MutationObserver(minimizeAttrib);
    attribObs.observe(attribRoot, { subtree: true, attributeFilter: ["class"] });
    minimizeAttrib();
    const onAttribPointerDown = (e: Event) => {
      if ((e.target as HTMLElement).closest?.(".maplibregl-ctrl-attrib-button")) {
        attribPinned = true;
        attribObs.disconnect();
      }
    };
    attribRoot.addEventListener("pointerdown", onAttribPointerDown, true);
    // Vangnet: stop de observer na de churn zodat hij niet eeuwig op elke
    // class-mutatie in de kaart draait (opgeruimd in de effect-cleanup).
    const attribObsStop = setTimeout(() => attribObs.disconnect(), 6000);
    map.addControl(
      new maplibregl.NavigationControl({ visualizePitch: true }),
      "top-right",
    );
    const geolocate = new maplibregl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: true,
    });
    // "Plan vanaf mijn locatie": geef de gefixde positie door zodat de planner
    // 'm als start kan zetten. De control centreert de kaart al zelf.
    geolocate.on("geolocate", (e) => {
      const c = (e as GeolocationPosition).coords;
      if (c) cbRef.current.onGeolocate?.(c.longitude, c.latitude);
    });
    map.addControl(geolocate, "top-right");
    map.addControl(
      new maplibregl.ScaleControl({ maxWidth: 120, unit: "metric" }),
      "bottom-left",
    );
    // Fullscreen op de app-shell i.p.v. alleen de kaart: fullscreen rendert
    // uitsluitend het gekozen element, dus met de kaart-container verdween de
    // (fixed) navigatiebalk compleet — en wie niet wist dat hij in fullscreen
    // zat, zag "de balk is weg en komt niet terug". Met body blijft de header
    // staan en is de knop zelf de weg terug.
    map.addControl(
      new maplibregl.FullscreenControl({ container: document.body }),
      "top-right",
    );

    // Komoot-style right rail: fit-route + 3D terrain toggle as tiny
    // custom controls (MapLibre control contract: onAdd returns a DOM node).
    const mkControl = (title: string, label: string, onClick: (btn: HTMLButtonElement) => void) => ({
      onAdd() {
        const div = document.createElement("div");
        div.className = "maplibregl-ctrl maplibregl-ctrl-group";
        const btn = document.createElement("button");
        btn.type = "button";
        btn.title = title;
        btn.style.fontSize = "15px";
        btn.textContent = label;
        btn.onclick = () => onClick(btn);
        div.appendChild(btn);
        return div;
      },
      onRemove() {},
    });
    map.addControl(
      mkControl("Zoom naar route", "⌖", () => {
        const coords = routeCoordsRef.current;
        if (!coords || coords.length < 2) return;
        const b = coords.reduce(
          (acc, c) => acc.extend([c[0], c[1]]),
          new maplibregl.LngLatBounds([coords[0][0], coords[0][1]], [coords[0][0], coords[0][1]]),
        );
        map.fitBounds(b, { padding: 60 });
      }),
      "top-right",
    );
    let terrainOn = false;
    map.addControl(
      mkControl("3D-reliëf", "3D", (btn) => {
        terrainOn = !terrainOn;
        if (terrainOn) {
          if (!map.getSource("terrain-dem")) {
            map.addSource("terrain-dem", {
              type: "raster-dem",
              tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],
              encoding: "terrarium",
              tileSize: 256,
              maxzoom: 14,
              attribution: "Terrain: Mapzen/AWS Open Data",
            });
          }
          map.setTerrain({ source: "terrain-dem", exaggeration: 1.3 });
          map.easeTo({ pitch: 55, duration: 600 });
          btn.style.fontWeight = "bold";
          btn.style.color = "#047857";
        } else {
          map.setTerrain(null);
          map.easeTo({ pitch: 0, duration: 600 });
          btn.style.fontWeight = "";
          btn.style.color = "";
        }
      }),
      "top-right",
    );

    // De kaart vult het venster tot y=0, maar de navigatiebalk (fixed, 48px)
    // ligt eroverheen: zonder deze marge zit "Zoom in" volledig onder de balk
    // (gemeten: top=10px) en "Zoom out" half — onklikbaar, waardoor je
    // onbedoeld op de knoppen eronder mikt. Marge = balkhoogte.
    const HEADER_H = 48;
    for (const pos of ["top-right", "top-left"] as const) {
      const el = map
        .getContainer()
        .querySelector<HTMLElement>(`.maplibregl-ctrl-${pos}`);
      if (el) el.style.marginTop = `${HEADER_H}px`;
    }

    // Layer bootstrap is NOT gated on the "load" event: on a slow tile CDN
    // "load" waits for every tile/glyph/sprite and can take tens of seconds
    // (or hang), leaving the planner without a route line while the basemap
    // is already visible. Same empirical lesson as EmbedView (GEN-135):
    // addSource/addLayer work as soon as the style JSON is in, long before
    // isStyleLoaded() turns true. ensure* helpers make retries idempotent
    // when a styledata event fires mid-bootstrap.
    let layersReady = false;
    const ensureSource = (id: string, spec: maplibregl.SourceSpecification) => {
      if (!map.getSource(id)) map.addSource(id, spec);
    };
    const ensureLayer = (
      spec: maplibregl.LayerSpecification,
      beforeId?: string,
    ) => {
      if (!map.getLayer(spec.id)) map.addLayer(spec, beforeId);
    };
    const initLayers = () => {
      if (layersReady) return;
      try {
        addAllLayers();
      } catch {
        return; // style not ready yet — the next styledata event retries
      }
      layersReady = true;
      setReady(true);
    };
    const addAllLayers = () => {
      // Sport-netwerk-overlays (Waymarked Trails, CC-BY-SA, opt-in in het
      // Kaartinhoud-paneel). Raster boven de basemap, onder de route.
      for (const net of ["hiking", "cycling", "mtb"] as const) {
        ensureSource(`wmt-${net}`, {
          type: "raster",
          tiles: [`https://tile.waymarkedtrails.org/${net}/{z}/{x}/{y}.png`],
          tileSize: 256,
          maxzoom: 18,
          attribution: "Routes © waymarkedtrails.org (CC-BY-SA)",
        });
        ensureLayer({
          id: `wmt-${net}`,
          type: "raster",
          source: `wmt-${net}`,
          layout: { visibility: "none" },
          paint: { "raster-opacity": 0.85 },
        });
      }
      ensureSource("route", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      ensureLayer({
        id: "route-casing",
        type: "line",
        source: "route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#ffffff", "line-width": 8 },
      });
      ensureLayer({
        id: "route-line",
        type: "line",
        source: "route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#2563eb", "line-width": 4 },
      });
      // Wide invisible hit-area so grabbing the line is forgiving (~24px).
      ensureLayer({
        id: "route-hit",
        type: "line",
        source: "route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#000000", "line-width": 24, "line-opacity": 0.01 },
      });
      // Off-grid legs: dashed overlay on top of the route line (GEN-141 A4).
      ensureSource("offgrid", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      ensureLayer({
        id: "offgrid-line",
        type: "line",
        source: "offgrid",
        layout: { "line-cap": "round" },
        paint: {
          "line-color": "#475569",
          "line-width": 3,
          "line-dasharray": [1, 2],
        },
      });
      // Onverharde stukken in amber op de route. Bewust vóór de alerts-laag
      // toegevoegd: een verbodsstuk moet altijd bovenop liggen, ook als het
      // toevallig ook onverhard is.
      ensureSource("unpaved", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      ensureLayer({
        id: "unpaved-line",
        type: "line",
        source: "unpaved",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#d97706", "line-width": 5 },
      });
      // GEN-129: restricted-access stretches painted red on top of the route.
      ensureSource("alerts", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      ensureLayer({
        id: "alert-line",
        type: "line",
        source: "alerts",
        layout: { "line-cap": "round" },
        paint: { "line-color": "#dc2626", "line-width": 5 },
      });
      // Komoot-style midpoint grab-handles per leg (GEN-141 A1). Purely a
      // visible affordance — dragging/clicking is handled by route-hit below.
      ensureSource("via-handles", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      ensureLayer({
        id: "via-handles",
        type: "circle",
        source: "via-handles",
        paint: {
          "circle-radius": 5,
          "circle-color": "#ffffff",
          "circle-stroke-color": "#2563eb",
          "circle-stroke-width": 2,
        },
      });
      // Distance markers along the route (GEN-137).
      ensureSource("km-markers", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      ensureLayer({
        id: "km-markers-circle",
        type: "circle",
        source: "km-markers",
        paint: {
          "circle-radius": 8,
          "circle-color": "#1e293b",
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 1.5,
        },
      });
      ensureLayer({
        id: "km-markers-label",
        type: "symbol",
        source: "km-markers",
        layout: {
          "text-field": ["get", "label"],
          "text-size": 9,
          "text-font": ["Noto Sans Regular"],
          "text-allow-overlap": true,
        },
        paint: { "text-color": "#ffffff" },
      });
      // Elevation-chart hover position on the route line
      ensureSource("hover-point", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      ensureLayer({
        id: "hover-point",
        type: "circle",
        source: "hover-point",
        paint: {
          "circle-radius": 6,
          "circle-color": "#2563eb",
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2,
        },
      });

      // GEN-115: community-highlight dots, colored per category. The source
      // stays empty until the planner enables the layer.
      ensureSource("highlights", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      ensureLayer({
        id: "highlights-dots",
        type: "circle",
        source: "highlights",
        paint: {
          // Komoot-stijl: kleine, rustige punten op overzichtsniveau die
          // pas groeien als je echt inzoomt. De tap-/klik-zone is los
          // hiervan gepadded (zie hitsAt) zodat ze bruikbaar blijven.
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            6, 1.8,
            12, 3,
            16, 5.5,
          ],
          "circle-color": [
            "match",
            ["get", "category"],
            "peak", CATEGORY_COLOR.peak ?? "#b45309",
            "viewpoint", CATEGORY_COLOR.viewpoint ?? "#0284c7",
            "hut", CATEGORY_COLOR.hut ?? "#92400e",
            "water", CATEGORY_COLOR.water ?? "#0ea5e9",
            "cafe", CATEGORY_COLOR.cafe ?? "#db2777",
            "monument", CATEGORY_COLOR.monument ?? "#7c3aed",
            "nature", CATEGORY_COLOR.nature ?? "#16a34a",
            "#dc2626",
          ],
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            6, 0.75,
            12, 1,
            16, 1.5,
          ],
        },
      });

      // GEN-115: segment highlights (kind='segment') drawn as a line, placed
      // just below the route so a planned route stays on top where they cross.
      ensureSource("highlight-segments", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      const segBefore = map.getLayer("route-casing") ? "route-casing" : undefined;
      ensureLayer(
        {
          id: "highlight-segments-casing",
          type: "line",
          source: "highlight-segments",
          layout: { "line-join": "round", "line-cap": "round" },
          paint: {
            "line-color": "#ffffff",
            "line-opacity": 0.85,
            "line-width": ["interpolate", ["linear"], ["zoom"], 8, 5, 14, 10],
          },
        },
        segBefore,
      );
      ensureLayer(
        {
          id: "highlight-segments-line",
          type: "line",
          source: "highlight-segments",
          layout: { "line-join": "round", "line-cap": "round" },
          paint: {
            "line-color": [
              "match",
              ["get", "category"],
              "peak", CATEGORY_COLOR.peak ?? "#b45309",
              "viewpoint", CATEGORY_COLOR.viewpoint ?? "#0284c7",
              "hut", CATEGORY_COLOR.hut ?? "#92400e",
              "water", CATEGORY_COLOR.water ?? "#0ea5e9",
              "cafe", CATEGORY_COLOR.cafe ?? "#db2777",
              "monument", CATEGORY_COLOR.monument ?? "#7c3aed",
              "nature", CATEGORY_COLOR.nature ?? "#16a34a",
              "#dc2626",
            ],
            "line-width": ["interpolate", ["linear"], ["zoom"], 8, 2.5, 14, 6],
          },
        },
        segBefore,
      );

      // Saved places (GEN-137): amber stars, owner-only layer.
      ensureSource("saved-places", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      ensureLayer({
        id: "saved-places-stars",
        type: "symbol",
        source: "saved-places",
        layout: {
          "text-field": "\u2605",
          "text-font": ["Noto Sans Regular"],
          "text-size": ["interpolate", ["linear"], ["zoom"], 6, 12, 12, 18],
          "text-allow-overlap": true,
        },
        paint: {
          "text-color": "#d97706",
          "text-halo-color": "#ffffff",
          "text-halo-width": 1.5,
        },
      });
    };
    map.on("styledata", initLayers);
    map.on("load", initLayers);
    initLayers();

    // --- Event bindings: registered exactly once, independent of style
    // readiness. Layer-scoped listeners on not-yet-existing layers are
    // safe (MapLibre resolves them per event).
    map.on("mouseenter", "via-handles", () => {
      map.getCanvas().style.cursor = "grab";
    });
    map.on("mouseleave", "via-handles", () => {
      map.getCanvas().style.cursor = "";
    });
    // Viewport melden zodat de highlight-laag per kaartbeeld kan laden.
    // Ook één keer meteen: zonder pan/zoom vuurt moveend nooit.
    const emitViewport = () => {
      const cb = cbRef.current.onViewportChange;
      if (!cb) return;
      const b = map.getBounds();
      cb(
        { w: b.getWest(), s: b.getSouth(), e: b.getEast(), n: b.getNorth() },
        map.getZoom(),
      );
    };
    map.on("moveend", emitViewport);
    emitViewport();

    map.on("mouseenter", "highlights-dots", () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", "highlights-dots", () => {
      map.getCanvas().style.cursor = "";
    });
    map.on("mouseenter", "highlight-segments-line", () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", "highlight-segments-line", () => {
      map.getCanvas().style.cursor = "";
    });
    map.on("mouseenter", "saved-places-stars", () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", "saved-places-stars", () => {
      map.getCanvas().style.cursor = "";
    });

    // queryRenderedFeatures throws on a layer id that does not exist (yet).
    // Klik-/tap-zone met padding: de highlight-punten zijn bewust klein
    // (Komoot-stijl), dus een exacte pixel-hit zou ze op touch onbruikbaar
    // maken. 10px marge ≈ vingervriendelijk zonder overlappende treffers.
    const HIT_PAD = 10;
    const hitsAt = (pt: maplibregl.Point, layerId: string) => {
      if (!map.getLayer(layerId)) return [];
      const box: [maplibregl.PointLike, maplibregl.PointLike] = [
        [pt.x - HIT_PAD, pt.y - HIT_PAD],
        [pt.x + HIT_PAD, pt.y + HIT_PAD],
      ];
      const hits = map.queryRenderedFeatures(box, { layers: [layerId] });
      if (hits.length < 2) return hits;
      // Meerdere treffers in de marge: de dichtstbijzijnde wint, anders
      // opent een klik soms een punt dat verder weg ligt dan een ander.
      return [...hits].sort((a, b) => {
        const d = (f: typeof a) => {
          const g = f.geometry;
          if (g.type !== "Point") return Number.POSITIVE_INFINITY;
          const p = map.project(g.coordinates as [number, number]);
          return (p.x - pt.x) ** 2 + (p.y - pt.y) ** 2;
        };
        return d(a) - d(b);
      });
    };

    // Click on empty map = add waypoint. Suppressed right after a line-drag.
    let suppressClick = false;
    map.on("click", (e) => {
      if (suppressClick) {
        suppressClick = false;
        return;
      }
      // Saved-place stars take top priority, then highlight dots.
      const spHits = hitsAt(e.point, "saved-places-stars");
        const sp = spHits[0];
        if (sp && cbRef.current.onSavedPlaceClick) {
          const [lon, lat] = (sp.geometry as GeoJSON.Point).coordinates;
          const p = sp.properties as Record<string, string>;
          cbRef.current.onSavedPlaceClick({
            id: p.id ?? "",
            name: p.name ?? "",
            lon: lon ?? e.lngLat.lng,
            lat: lat ?? e.lngLat.lat,
          });
          return;
        }
      // Highlight dots take priority over adding a waypoint.
      const hlHits = hitsAt(e.point, "highlights-dots");
        const hl = hlHits[0];
        if (hl && cbRef.current.onHighlightClick) {
          const [lon, lat] = (hl.geometry as GeoJSON.Point).coordinates;
          const p = hl.properties as Record<string, string>;
          cbRef.current.onHighlightClick({
            id: p.id ?? "",
            name: p.name ?? "",
            category: p.category ?? "other",
            description: p.description ?? "",
            lon: lon ?? e.lngLat.lng,
            lat: lat ?? e.lngLat.lat,
          });
          return;
        }
        // Segment highlights (lines) — a line has no single point, so anchor
        // the balloon at the click location.
        const segHits = hitsAt(e.point, "highlight-segments-line");
        const segHl = segHits[0];
        if (segHl && cbRef.current.onHighlightClick) {
          const p = segHl.properties as Record<string, string>;
          cbRef.current.onHighlightClick({
            id: p.id ?? "",
            name: p.name ?? "",
            category: p.category ?? "other",
            description: p.description ?? "",
            lon: e.lngLat.lng,
            lat: e.lngLat.lat,
          });
          return;
        }
        // Clicks on the route line open the same balloon as anywhere else
        // (Komoot behaviour) — only an actual drag is handled separately.
        cbRef.current.onMapClick(e.lngLat.lng, e.lngLat.lat);
      });

      // Drag the route line to insert a via point (Komoot-style).
      let routeDragging = false;
      let lastHoverIdx: number | null = null;
      map.on("mouseenter", "route-hit", () => {
        map.getCanvas().style.cursor = "grab";
      });
      // Kaart↔profiel-link: cursor over de lijn → dichtstbijzijnde route-index
      // → elevation-marker. Lineaire scan over de route-coords (paar duizend
      // punten = sub-ms); gededupeerd op index zodat we niet elke pixel een
      // setState triggeren. Tijdens slepen onderdrukt zodat de via-drag niet
      // met scrub-updates vecht.
      map.on("mousemove", "route-hit", (e) => {
        if (routeDragging || !cbRef.current.onRouteHover) return;
        const coords = routeCoordsRef.current;
        if (!coords || coords.length < 2) return;
        const { lng, lat } = e.lngLat;
        let best = 0;
        let bestD = Infinity;
        for (let i = 0; i < coords.length; i++) {
          const dx = coords[i][0] - lng;
          const dy = coords[i][1] - lat;
          const d = dx * dx + dy * dy;
          if (d < bestD) {
            bestD = d;
            best = i;
          }
        }
        if (best !== lastHoverIdx) {
          lastHoverIdx = best;
          cbRef.current.onRouteHover(best);
        }
      });
      map.on("mouseleave", "route-hit", () => {
        map.getCanvas().style.cursor = "";
        lastHoverIdx = null;
        cbRef.current.onRouteHover?.(null);
      });
      map.on("mousedown", "route-hit", (e) => {
        if (e.originalEvent.button !== 0) return;
        e.preventDefault();
        routeDragging = true;
        map.getCanvas().style.cursor = "grabbing";
        const startPt = e.point;
        let moved = false;
        // Ghost is created lazily on first real movement: an eagerly-added
        // marker sits under the cursor and swallows the click event, which
        // kept the balloon from opening on plain line-clicks.
        let ghost: maplibregl.Marker | null = null;
        const onMove = (ev: maplibregl.MapMouseEvent) => {
          if (
            !moved &&
            (Math.abs(ev.point.x - startPt.x) > 4 ||
              Math.abs(ev.point.y - startPt.y) > 4)
          ) {
            moved = true;
            ghost = new maplibregl.Marker({ color: "#2563eb", scale: 0.8 })
              .setLngLat(ev.lngLat)
              .addTo(map);
          }
          ghost?.setLngLat(ev.lngLat);
        };
        const onUp = (ev: maplibregl.MapMouseEvent) => {
          map.off("mousemove", onMove);
          ghost?.remove();
          routeDragging = false;
          map.getCanvas().style.cursor = "";
          // Only an actual drag inserts a via (plain clicks on the line were
          // spawning waypoints — reported 2026-07-19). A non-drag click falls
          // through to the normal click handler and opens the balloon.
          if (moved) {
            // Swallow the click event fired by THIS mouseup, not later ones.
            suppressClick = true;
            setTimeout(() => {
              suppressClick = false;
            }, 300);
            cbRef.current.onRouteDrop(ev.lngLat.lng, ev.lngLat.lat);
          }
        };
      map.on("mousemove", onMove);
      map.once("mouseup", onUp);
    });

    mapRef.current = map;
    if (process.env.NODE_ENV === "development") {
      // Debug handle for browser-console inspection only.
      (window as unknown as { __map?: maplibregl.Map }).__map = map;
    }

    // Canvas-sizing guard. MapLibre sizes the GL canvas from the container's
    // measured dimensions at construction time; when the container is still
    // unmeasured (0-height during hydration, a late-resolving `h-dvh`/flex
    // parent), the canvas falls back to its 400×300 default and MapLibre's
    // internal trackResize observer does not always correct it. That left the
    // map rendering in a 400×300 corner while the rest of the viewport was
    // dead space — and clicks outside that corner never reached the map, so
    // adding route points failed everywhere but the top-left. We own a
    // ResizeObserver on the container so every dimension change (initial
    // layout, orientation flip, mobile browser-chrome show/hide) forces a
    // resize, and we nudge once after the first paint to catch the init race.
    const forceResize = () => map.resize();
    const raf = requestAnimationFrame(forceResize);
    map.once("load", forceResize);
    const resizeObs =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(forceResize)
        : null;
    if (resizeObs && containerRef.current) resizeObs.observe(containerRef.current);

    return () => {
      cancelAnimationFrame(raf);
      resizeObs?.disconnect();
      attribObs.disconnect();
      clearTimeout(attribObsStop);
      attribRoot.removeEventListener("pointerdown", onAttribPointerDown, true);
      map.remove();
      mapRef.current = null;
      setReady(false);
    };
    // Init draait één keer; `route` wordt alleen als START-bounds gelezen, de
    // route-sync-effect hieronder verwerkt latere wijzigingen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync route line. Fit bounds only when a route first appears — refitting
  // on every edit makes the planner feel slow and yanks the camera around.
  const hasFitRef = useRef(false);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const src = map.getSource("route") as maplibregl.GeoJSONSource | undefined;
    if (!src) return;
    if (route) {
      src.setData(route);
      routeCoordsRef.current =
        (route.geometry as GeoJSON.LineString | undefined)?.coordinates ?? null;
      if (!hasFitRef.current) {
        const coords = (route.geometry as GeoJSON.LineString).coordinates;
        if (!coords?.length) return;
        const bounds = coords.reduce(
          (bd, c) => bd.extend([c[0], c[1]]),
          new maplibregl.LngLatBounds(
            [coords[0][0], coords[0][1]],
            [coords[0][0], coords[0][1]],
          ),
        );
        // Fit pas zodra de canvas écht gemeten is. Bij eerste load kan de GL-
        // canvas nog op zijn 400×300-default staan (of 0×0 terwijl de pane
        // offscreen is); de layout-bewuste left:400-padding overtreft dan de
        // breedte → fitBounds degenereert en de route belandt uitgezoomd,
        // buiten beeld óf achter het paneel (tour-detail toonde zo een lege
        // kaart). Daarom: probeer de fit, en her-probeer bij elke map-resize
        // tot er één tegen een fatsoenlijk-gemeten canvas draait.
        // Fit pas nadat resizes zijn uitgeraasd. Bij eerste load kaskadeert de
        // canvas door tussenmaten (400×300-default → 0×0 terwijl de pane
        // offscreen is → uiteindelijke containergrootte). Meteen fitten op de
        // eerste "acceptabele" maat pakte een tussenmaat en left:400-padding
        // liet de route uitgezoomd/achter het paneel belanden. Daarom
        // debouncen we: na de laatste resize (150 ms stil) fitten we één keer
        // tegen de definitieve maat. NB: NOOIT map.resize() vanuit een
        // 'resize'-listener — dat vuurt 'resize' en geeft oneindige recursie.
        let fitTimer: ReturnType<typeof setTimeout> | null = null;
        const doFit = () => {
          fitTimer = null;
          if (hasFitRef.current) return;
          const canvas = map.getCanvas();
          const cont = map.getContainer();
          const cw = cont.clientWidth;
          const ch = cont.clientHeight;
          // Canvas nog niet gesynct met de container, of pane verborgen/te
          // klein? Sla over; de volgende resize plant een nieuwe poging.
          if (
            Math.abs(canvas.clientWidth - cw) > 2 ||
            Math.abs(canvas.clientHeight - ch) > 2 ||
            cw < 200 ||
            ch < 200
          ) {
            return;
          }
          const wide = cw >= 768;
          // Padding volgt de layout: paneel links (md+) of onderaan (mobiel).
          const left = wide ? Math.min(400, Math.round(cw * 0.4)) : 40;
          const bottom = wide
            ? 60
            : Math.min(Math.round(ch * 0.45) + 24, Math.round(ch * 0.5));
          map.fitBounds(bounds, { padding: { top: 60, right: 60, left, bottom } });
          hasFitRef.current = true;
          map.off("resize", scheduleFit);
        };
        const scheduleFit = () => {
          if (hasFitRef.current) return;
          if (fitTimer) clearTimeout(fitTimer);
          fitTimer = setTimeout(doFit, 150);
        };
        scheduleFit();
        map.on("resize", scheduleFit);
        return () => {
          if (fitTimer) clearTimeout(fitTimer);
          map.off("resize", scheduleFit);
        };
      }
    } else {
      src.setData({ type: "FeatureCollection", features: [] });
      hasFitRef.current = false;
    }
  }, [route, ready]);

  // Sync via-handles + off-grid overlays (GEN-141)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    (map.getSource("via-handles") as maplibregl.GeoJSONSource | undefined)?.setData(
      viaHandles ?? { type: "FeatureCollection", features: [] },
    );
  }, [viaHandles, ready]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    (map.getSource("offgrid") as maplibregl.GeoJSONSource | undefined)?.setData(
      offGridLines ?? { type: "FeatureCollection", features: [] },
    );
  }, [offGridLines, ready]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    (map.getSource("alerts") as maplibregl.GeoJSONSource | undefined)?.setData(
      alertLines ?? { type: "FeatureCollection", features: [] },
    );
  }, [alertLines, ready]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    (map.getSource("unpaved") as maplibregl.GeoJSONSource | undefined)?.setData(
      unpavedLines ?? { type: "FeatureCollection", features: [] },
    );
  }, [unpavedLines, ready]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    (map.getSource("km-markers") as maplibregl.GeoJSONSource | undefined)?.setData(
      kmMarkers ?? { type: "FeatureCollection", features: [] },
    );
  }, [kmMarkers, ready]);

  // Sync highlights layer (GEN-115)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const src = map.getSource("highlights") as
      | maplibregl.GeoJSONSource
      | undefined;
    if (!src) return;
    src.setData(
      highlights ?? { type: "FeatureCollection", features: [] },
    );
  }, [highlights, ready]);

  // Sync segment-highlights layer (GEN-115)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const src = map.getSource("highlight-segments") as
      | maplibregl.GeoJSONSource
      | undefined;
    src?.setData(
      highlightSegments ?? { type: "FeatureCollection", features: [] },
    );
  }, [highlightSegments, ready]);

  // Sync network overlays (Kaartinhoud toggles)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    for (const net of ["hiking", "cycling", "mtb"] as const) {
      if (map.getLayer(`wmt-${net}`)) {
        map.setLayoutProperty(
          `wmt-${net}`,
          "visibility",
          networkOverlays?.[net] ? "visible" : "none",
        );
      }
    }
  }, [networkOverlays, ready]);

  // Sync saved-places layer (GEN-137)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const src = map.getSource("saved-places") as
      | maplibregl.GeoJSONSource
      | undefined;
    src?.setData(
      savedPlaces ?? { type: "FeatureCollection", features: [] },
    );
  }, [savedPlaces, ready]);

  // Camera-focus op verzoek (klik op waarschuwing/klim). Ease naar het punt en
  // zoom desnoods in tot een leesbaar niveau; nooit uitzoomen als de gebruiker
  // al dichterbij zit. Getriggerd op de teller zodat herhaald klikken werkt.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !focusPoint) return;
    map.easeTo({
      center: [focusPoint.lon, focusPoint.lat],
      zoom: Math.max(map.getZoom(), 14),
      duration: 700,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusPoint?.n, ready]);

  // Sync elevation-hover point
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const src = map.getSource("hover-point") as
      | maplibregl.GeoJSONSource
      | undefined;
    if (!src) return;
    src.setData(
      hoverPoint
        ? {
            type: "Feature",
            properties: {},
            geometry: { type: "Point", coordinates: hoverPoint },
          }
        : { type: "FeatureCollection", features: [] },
    );
  }, [hoverPoint, ready]);

  // Sync waypoint markers (draggable, clickable → balloon).
  // Komoot-style hierarchy (GEN-141 A3): start/end are full pins, vias are
  // small numbered dots.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = new Map();
    const filledCount = waypoints.filter(Boolean).length;
    const first = waypoints.find(Boolean) ?? null;
    waypoints.forEach((wp, slotIndex) => {
      if (!wp) return;
      const orderIndex = waypoints.slice(0, slotIndex + 1).filter(Boolean).length - 1;
      const isFirst = orderIndex === 0;
      const isLast = orderIndex === filledCount - 1;
      // Round trip: the end point sits on the start — show it green like A.
      const isLoopEnd =
        isLast && !isFirst && first !== null &&
        wp.lon === first.lon && wp.lat === first.lat;

      let marker: maplibregl.Marker;
      if (isFirst || isLast) {
        marker = new maplibregl.Marker({
          color: isLoopEnd || isFirst ? BADGE_COLORS[0] : BADGE_COLORS[1],
          draggable: true,
        });
      } else {
        // Small numbered via-dot (number matches the panel badge = slot index)
        const el = document.createElement("div");
        const inner = document.createElement("div");
        inner.textContent = String(slotIndex);
        inner.style.cssText =
          "width:18px;height:18px;border-radius:50%;background:#2563eb;" +
          "border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4);" +
          "color:#fff;font-size:10px;font-weight:700;display:flex;" +
          "align-items:center;justify-content:center;transition:transform .1s";
        el.appendChild(inner);
        marker = new maplibregl.Marker({ element: el, draggable: true });
      }
      marker.setLngLat([wp.lon, wp.lat]).addTo(map);

      // A drag fires a click on the element afterwards — swallow that one.
      let justDragged = false;
      marker.on("dragend", () => {
        justDragged = true;
        setTimeout(() => {
          justDragged = false;
        }, 150);
        const p = marker.getLngLat();
        cbRef.current.onMarkerDragEnd(slotIndex, p.lng, p.lat);
      });
      marker.getElement().addEventListener("click", (ev) => {
        ev.stopPropagation();
        if (justDragged) return;
        cbRef.current.onMarkerClick?.(slotIndex);
      });
      marker.getElement().style.cursor = "pointer";
      markersRef.current.set(slotIndex, marker);
    });
  }, [waypoints]);

  // Panel-row hover → emphasize the matching map marker (GEN-141 A6). The
  // marker wrapper's transform is owned by MapLibre, so scale the first child.
  useEffect(() => {
    markersRef.current.forEach((marker, slotIndex) => {
      const child = marker.getElement().firstElementChild as HTMLElement | null;
      if (!child) return;
      child.style.transition = "transform .1s";
      child.style.transformOrigin = "center bottom";
      child.style.transform = slotIndex === emphasisSlot ? "scale(1.25)" : "";
    });
  }, [emphasisSlot, waypoints]);

  // Project the balloon anchor to screen coords; track the camera while open.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !balloonAt) {
      setBalloonXY(null);
      return;
    }
    const update = () => {
      const p = map.project([balloonAt.lon, balloonAt.lat]);
      setBalloonXY({ x: p.x, y: p.y });
    };
    update();
    map.on("move", update);
    return () => {
      map.off("move", update);
    };
  }, [balloonAt, ready]);

  return (
    <div className="relative h-dvh w-full">
      <div ref={containerRef} className="h-full w-full" />
      {balloonXY && balloonContent && (
        <div
          className="absolute z-20"
          style={{
            left: balloonXY.x,
            top: balloonXY.y,
            transform: "translate(-50%, calc(-100% - 12px))",
          }}
        >
          {balloonContent}
          {/* little pointer tip */}
          <div className="absolute left-1/2 top-full -translate-x-1/2 border-8 border-transparent border-t-white/95" />
        </div>
      )}
    </div>
  );
}
