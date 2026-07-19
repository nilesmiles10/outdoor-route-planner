"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

// OpenFreeMap "liberty": free OSM vector tiles, no API key (see LEGAL.md).
const STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

export type Waypoint = { name: string; lon: number; lat: number };

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
};

export default function MapView({
  route,
  waypoints,
  hoverPoint,
  onMapClick,
  onMarkerDragEnd,
  onRouteDrop,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const [ready, setReady] = useState(false);
  // Keep latest callbacks without re-binding map listeners.
  const cbRef = useRef({ onMapClick, onMarkerDragEnd, onRouteDrop });
  cbRef.current = { onMapClick, onMarkerDragEnd, onRouteDrop };

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

      // Click on empty map = add waypoint. Suppressed right after a line-drag.
      let suppressClick = false;
      map.on("click", (e) => {
        if (suppressClick) {
          suppressClick = false;
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
        const ghost = new maplibregl.Marker({ color: "#2563eb", scale: 0.8 })
          .setLngLat(e.lngLat)
          .addTo(map);
        const onMove = (ev: maplibregl.MapMouseEvent) => ghost.setLngLat(ev.lngLat);
        const onUp = (ev: maplibregl.MapMouseEvent) => {
          map.off("mousemove", onMove);
          ghost.remove();
          map.getCanvas().style.cursor = "";
          // Swallow only the click event fired by THIS mouseup, not later ones.
          suppressClick = true;
          setTimeout(() => {
            suppressClick = false;
          }, 300);
          cbRef.current.onRouteDrop(ev.lngLat.lng, ev.lngLat.lat);
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

  // Sync waypoint markers (draggable)
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
      marker.on("dragend", () => {
        const p = marker.getLngLat();
        cbRef.current.onMarkerDragEnd(slotIndex, p.lng, p.lat);
      });
      markersRef.current.push(marker);
    });
  }, [waypoints]);

  return <div ref={containerRef} className="h-dvh w-full" />;
}
