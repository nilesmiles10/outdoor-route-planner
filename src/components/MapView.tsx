"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

// OpenFreeMap "liberty": free OSM vector tiles, no API key (see LEGAL.md).
const STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

export type Waypoint = { name: string; lon: number; lat: number };

type Props = {
  route: GeoJSON.Feature | null;
  a: Waypoint | null;
  b: Waypoint | null;
};

export default function MapView({ route, a, b }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<{ a?: maplibregl.Marker; b?: maplibregl.Marker }>(
    {},
  );
  const [ready, setReady] = useState(false);

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
        paint: { "line-color": "#ffffff", "line-width": 7 },
      });
      map.addLayer({
        id: "route-line",
        type: "line",
        source: "route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#2563eb", "line-width": 4 },
      });
      setReady(true);
    });
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      setReady(false);
    };
  }, []);

  // Sync route line + fit bounds
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const src = map.getSource("route") as maplibregl.GeoJSONSource | undefined;
    if (!src) return;
    if (route) {
      src.setData(route);
      const coords = (route.geometry as GeoJSON.LineString).coordinates;
      const bounds = coords.reduce(
        (bd, c) => bd.extend([c[0], c[1]]),
        new maplibregl.LngLatBounds(
          [coords[0][0], coords[0][1]],
          [coords[0][0], coords[0][1]],
        ),
      );
      map.fitBounds(bounds, { padding: { top: 60, bottom: 60, left: 380, right: 60 } });
    } else {
      src.setData({ type: "FeatureCollection", features: [] });
    }
  }, [route, ready]);

  // Sync A/B markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const sync = (key: "a" | "b", wp: Waypoint | null, color: string) => {
      markersRef.current[key]?.remove();
      markersRef.current[key] = undefined;
      if (wp) {
        markersRef.current[key] = new maplibregl.Marker({ color })
          .setLngLat([wp.lon, wp.lat])
          .addTo(map);
      }
    };
    sync("a", a, "#16a34a");
    sync("b", b, "#dc2626");
    if (a && !b) mapRef.current?.flyTo({ center: [a.lon, a.lat], zoom: 11 });
  }, [a, b]);

  return <div ref={containerRef} className="h-dvh w-full" />;
}
