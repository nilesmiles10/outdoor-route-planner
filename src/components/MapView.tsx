"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { CATEGORY_COLOR } from "@/lib/highlights";

// OpenFreeMap "liberty": free OSM vector tiles, no API key (see LEGAL.md).
const STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

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
  waypoints: (Waypoint | null)[];
  hoverPoint: GeoJSON.Position | null;
  onMapClick: (lon: number, lat: number) => void;
  onMarkerDragEnd: (slotIndex: number, lon: number, lat: number) => void;
  onRouteDrop: (lon: number, lat: number) => void;
  // GEN-115: community-POI layer (optional — TourView doesn't pass these).
  highlights?: GeoJSON.FeatureCollection | null;
  onHighlightClick?: (h: HighlightClick) => void;
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
  // GEN-137: distance markers along the route (every 5/10 km).
  kmMarkers?: GeoJSON.FeatureCollection | null;
  emphasisSlot?: number | null;
};

export default function MapView({
  route,
  waypoints,
  hoverPoint,
  onMapClick,
  onMarkerDragEnd,
  onRouteDrop,
  highlights,
  onHighlightClick,
  savedPlaces,
  onSavedPlaceClick,
  balloonAt,
  balloonContent,
  onMarkerClick,
  viaHandles,
  offGridLines,
  alertLines,
  kmMarkers,
  emphasisSlot,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<Map<number, maplibregl.Marker>>(new Map());
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
  });
  cbRef.current = {
    onMapClick,
    onMarkerDragEnd,
    onRouteDrop,
    onHighlightClick,
    onSavedPlaceClick,
    onMarkerClick,
  };

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE_URL,
      center: [5.1214, 52.0907], // Utrecht
      zoom: 8,
    });
    map.addControl(
      new maplibregl.NavigationControl({ visualizePitch: true }),
      "top-right",
    );
    map.addControl(
      new maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
      }),
      "top-right",
    );
    map.addControl(
      new maplibregl.ScaleControl({ maxWidth: 120, unit: "metric" }),
      "bottom-left",
    );

    map.on("load", () => {
      map.addSource("route", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "route-casing",
        type: "line",
        source: "route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#ffffff", "line-width": 8 },
      });
      map.addLayer({
        id: "route-line",
        type: "line",
        source: "route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#2563eb", "line-width": 4 },
      });
      // Wide invisible hit-area so grabbing the line is forgiving (~24px).
      map.addLayer({
        id: "route-hit",
        type: "line",
        source: "route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#000000", "line-width": 24, "line-opacity": 0.01 },
      });
      // Off-grid legs: dashed overlay on top of the route line (GEN-141 A4).
      map.addSource("offgrid", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
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
      // GEN-129: restricted-access stretches painted red on top of the route.
      map.addSource("alerts", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "alert-line",
        type: "line",
        source: "alerts",
        layout: { "line-cap": "round" },
        paint: { "line-color": "#dc2626", "line-width": 5 },
      });
      // Komoot-style midpoint grab-handles per leg (GEN-141 A1). Purely a
      // visible affordance — dragging/clicking is handled by route-hit below.
      map.addSource("via-handles", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
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
      map.on("mouseenter", "via-handles", () => {
        map.getCanvas().style.cursor = "grab";
      });
      map.on("mouseleave", "via-handles", () => {
        map.getCanvas().style.cursor = "";
      });
      // Distance markers along the route (GEN-137).
      map.addSource("km-markers", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
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
      map.addLayer({
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
      map.addSource("hover-point", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
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
      map.addSource("highlights", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "highlights-dots",
        type: "circle",
        source: "highlights",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 6, 3, 12, 7],
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
          "circle-stroke-width": 1.5,
        },
      });
      map.on("mouseenter", "highlights-dots", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "highlights-dots", () => {
        map.getCanvas().style.cursor = "";
      });

      // Saved places (GEN-137): amber stars, owner-only layer.
      map.addSource("saved-places", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
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
      map.on("mouseenter", "saved-places-stars", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "saved-places-stars", () => {
        map.getCanvas().style.cursor = "";
      });

      // Click on empty map = add waypoint. Suppressed right after a line-drag.
      let suppressClick = false;
      map.on("click", (e) => {
        if (suppressClick) {
          suppressClick = false;
          return;
        }
        // Saved-place stars take top priority, then highlight dots.
        const spHits = map.queryRenderedFeatures(e.point, {
          layers: ["saved-places-stars"],
        });
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
        const hlHits = map.queryRenderedFeatures(e.point, {
          layers: ["highlights-dots"],
        });
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
        // Clicks on the route line open the same balloon as anywhere else
        // (Komoot behaviour) — only an actual drag is handled separately.
        cbRef.current.onMapClick(e.lngLat.lng, e.lngLat.lat);
      });

      // Drag the route line to insert a via point (Komoot-style).
      map.on("mouseenter", "route-hit", () => {
        map.getCanvas().style.cursor = "grab";
      });
      map.on("mouseleave", "route-hit", () => {
        map.getCanvas().style.cursor = "";
      });
      map.on("mousedown", "route-hit", (e) => {
        if (e.originalEvent.button !== 0) return;
        e.preventDefault();
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

      setReady(true);
    });

    mapRef.current = map;
    if (process.env.NODE_ENV === "development") {
      // Debug handle for browser-console inspection only.
      (window as unknown as { __map?: maplibregl.Map }).__map = map;
    }
    return () => {
      map.remove();
      mapRef.current = null;
      setReady(false);
    };
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
      if (!hasFitRef.current) {
        const coords = (route.geometry as GeoJSON.LineString).coordinates;
        const bounds = coords.reduce(
          (bd, c) => bd.extend([c[0], c[1]]),
          new maplibregl.LngLatBounds(
            [coords[0][0], coords[0][1]],
            [coords[0][0], coords[0][1]],
          ),
        );
        map.fitBounds(bounds, {
          padding: { top: 60, bottom: 60, left: 400, right: 60 },
        });
        hasFitRef.current = true;
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
