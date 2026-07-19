"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { CATEGORY_COLOR } from "@/lib/highlights";

// OpenFreeMap "liberty": free OSM vector tiles, no API key (see LEGAL.md).
const STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

export type Waypoint = { name: string; lon: number; lat: number };

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
  // Komoot-style click balloon: anchor position + React content, rendered
  // as an overlay that tracks the map camera. Optional (TourView skips it).
  balloonAt?: { lon: number; lat: number } | null;
  balloonContent?: React.ReactNode;
  // Click on an existing waypoint marker (to open its remove/edit balloon).
  onMarkerClick?: (slotIndex: number) => void;
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
  balloonAt,
  balloonContent,
  onMarkerClick,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const [ready, setReady] = useState(false);
  const [balloonXY, setBalloonXY] = useState<{ x: number; y: number } | null>(null);
  // Keep latest callbacks without re-binding map listeners.
  const cbRef = useRef({
    onMapClick,
    onMarkerDragEnd,
    onRouteDrop,
    onHighlightClick,
    onMarkerClick,
  });
  cbRef.current = {
    onMapClick,
    onMarkerDragEnd,
    onRouteDrop,
    onHighlightClick,
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

      // Click on empty map = add waypoint. Suppressed right after a line-drag.
      let suppressClick = false;
      map.on("click", (e) => {
        if (suppressClick) {
          suppressClick = false;
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
        const hits = map.queryRenderedFeatures(e.point, {
          layers: ["route-hit"],
        });
        if (hits.length > 0) return; // clicks on the line are for dragging
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
        const ghost = new maplibregl.Marker({ color: "#2563eb", scale: 0.8 })
          .setLngLat(e.lngLat)
          .addTo(map);
        const onMove = (ev: maplibregl.MapMouseEvent) => {
          if (
            Math.abs(ev.point.x - startPt.x) > 4 ||
            Math.abs(ev.point.y - startPt.y) > 4
          ) {
            moved = true;
          }
          ghost.setLngLat(ev.lngLat);
        };
        const onUp = (ev: maplibregl.MapMouseEvent) => {
          map.off("mousemove", onMove);
          ghost.remove();
          map.getCanvas().style.cursor = "";
          // Swallow only the click event fired by THIS mouseup, not later ones.
          suppressClick = true;
          setTimeout(() => {
            suppressClick = false;
          }, 300);
          // A plain click (no real movement) must NOT insert a via point —
          // only an actual drag does. Repeated clicks on the line were
          // spawning waypoints (reported 2026-07-19).
          if (moved) cbRef.current.onRouteDrop(ev.lngLat.lng, ev.lngLat.lat);
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

  // Sync waypoint markers (draggable, clickable → balloon)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
    const filled = waypoints.filter(Boolean).length;
    waypoints.forEach((wp, slotIndex) => {
      if (!wp) return;
      const orderIndex = waypoints.slice(0, slotIndex + 1).filter(Boolean).length - 1;
      const marker = new maplibregl.Marker({
        color: waypointColor(orderIndex, filled),
        draggable: true,
      })
        .setLngLat([wp.lon, wp.lat])
        .addTo(map);
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
      markersRef.current.push(marker);
    });
  }, [waypoints]);

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
