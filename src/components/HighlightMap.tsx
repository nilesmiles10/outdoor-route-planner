"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

const STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

// Small static-ish map for the highlight page (GEN-138). A point highlight
// gets a marker; a segment highlight draws its line and fits to it.
export default function HighlightMap({
  lon,
  lat,
  geometry,
  color = "#047857",
}: {
  lon: number;
  lat: number;
  geometry?: GeoJSON.LineString | null;
  color?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const map = new maplibregl.Map({
      container: ref.current,
      style: STYLE_URL,
      center: [lon, lat],
      zoom: 12,
      attributionControl: { compact: true },
    });
    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      "top-right",
    );

    const coords =
      geometry?.type === "LineString" && geometry.coordinates.length > 1
        ? (geometry.coordinates as [number, number][])
        : null;

    if (coords) {
      const drawLine = () => {
        if (map.getSource("seg")) return;
        try {
          map.addSource("seg", {
            type: "geojson",
            data: {
              type: "Feature",
              properties: {},
              geometry: { type: "LineString", coordinates: coords },
            },
          });
          map.addLayer({
            id: "seg-casing",
            type: "line",
            source: "seg",
            layout: { "line-join": "round", "line-cap": "round" },
            paint: { "line-color": "#ffffff", "line-width": 7 },
          });
          map.addLayer({
            id: "seg-line",
            type: "line",
            source: "seg",
            layout: { "line-join": "round", "line-cap": "round" },
            paint: { "line-color": color, "line-width": 4 },
          });
        } catch {
          return; // style JSON not in yet — a later styledata/load retries
        }
        try {
          const bounds = coords.reduce(
            (acc, c) => acc.extend(c),
            new maplibregl.LngLatBounds(coords[0], coords[0]),
          );
          map.fitBounds(bounds, { padding: 36, duration: 0 });
        } catch {
          /* map not sized yet — keeps the constructor center/zoom */
        }
      };
      // OpenFreeMap's CDN sometimes stalls so "load" never fires; addSource/
      // addLayer already work once the style JSON is in (styledata), so the
      // line renders on a blank basemap instead of waiting forever.
      map.on("styledata", drawLine);
      map.on("load", drawLine);
      drawLine();
    } else {
      new maplibregl.Marker({ color: "#dc2626" })
        .setLngLat([lon, lat])
        .addTo(map);
    }

    return () => {
      map.remove();
    };
  }, [lon, lat, geometry, color]);

  return <div ref={ref} className="h-56 w-full overflow-hidden rounded-xl" />;
}
