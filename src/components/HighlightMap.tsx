"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

const STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

// Small static-ish map with a single marker for the highlight page (GEN-138).
export default function HighlightMap({ lon, lat }: { lon: number; lat: number }) {
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
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    new maplibregl.Marker({ color: "#dc2626" }).setLngLat([lon, lat]).addTo(map);
    return () => {
      map.remove();
    };
  }, [lon, lat]);

  return <div ref={ref} className="h-56 w-full overflow-hidden rounded-xl" />;
}
