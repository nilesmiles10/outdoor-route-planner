"use client";

// GEN-135 — minimal embeddable route map. Deliberately NOT MapView (that
// carries the whole planner: balloons, handles, highlight layers). Route
// line + A/B dots + fitBounds; scroll-zoom stays off so the iframe never
// traps the host page's scroll (double-click/pinch still zoom).

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { mapStyle, attachBasemapFallback } from "@/lib/mapStyle";



export default function EmbedView({
  coordinates,
}: {
  coordinates: GeoJSON.Position[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    // Same create-once pattern as MapView: no cleanup/remove — a StrictMode
    // remount would otherwise cancel the in-flight style fetch and "load"
    // never fires on the surviving instance.
    if (!containerRef.current || mapRef.current) return;
    // Initial bounds MUST go into the constructor: without them the map
    // opens at zoom 0 and "load" waits for world tiles + glyph ranges for
    // every script on earth — on a slow tile CDN that effectively never
    // completes (planner never hits this: it starts at zoom 8).
    const b = coordinates.reduce(
      (acc, c) => acc.extend([c[0], c[1]]),
      new maplibregl.LngLatBounds(
        [coordinates[0][0], coordinates[0][1]],
        [coordinates[0][0], coordinates[0][1]],
      ),
    );
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: mapStyle(),
      bounds: b,
      fitBoundsOptions: { padding: 28 },
      scrollZoom: false,
    });
    mapRef.current = map;
    attachBasemapFallback(map);
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }));
    const dot = (color: string, pos: GeoJSON.Position) =>
      new maplibregl.Marker({ color, scale: 0.7 })
        .setLngLat([pos[0], pos[1]])
        .addTo(map);
    dot("#dc2626", coordinates[coordinates.length - 1]);
    dot("#16a34a", coordinates[0]);
    // Add the route as soon as the STYLE is ready — "load" also waits for
    // every tile and glyph range, which on a slow tile CDN can take tens of
    // seconds; the route line is the whole point of the widget.
    // NOT gated on isStyleLoaded(): that flag stays false until every
    // sprite/glyph download settles and never turns true on a stalling
    // CDN, while addSource/addLayer already work (verified empirically —
    // probe layer rendered fine with isStyleLoaded() === false). Try and
    // retry on the next styledata if the style really isn't ready yet.
    let routeAdded = false;
    const addRoute = () => {
      if (routeAdded) return;
      try {
        addRouteLayers();
        routeAdded = true;
      } catch {
        // style not ready — a later styledata event retries
      }
    };
    const addRouteLayers = () => {
      map.addSource("route", {
        type: "geojson",
        data: {
          type: "Feature",
          properties: {},
          geometry: { type: "LineString", coordinates },
        },
      });
      map.addLayer({
        id: "route-casing",
        type: "line",
        source: "route",
        paint: { "line-color": "#ffffff", "line-width": 7 },
      });
      map.addLayer({
        id: "route-line",
        type: "line",
        source: "route",
        paint: { "line-color": "#2563eb", "line-width": 4 },
      });
    };
    map.on("styledata", addRoute);
    map.on("load", addRoute);
    addRoute();

    // Canvas-sizing guard (zelfde bug + fix als MapView, commit ~iteratie 1):
    // de GL-canvas valt terug op MapLibre's 400×300-default als de container
    // bij constructie nog niet gemeten is, en de interne trackResize-observer
    // corrigeert dat hier niet — de embed rendert dan enkel in de linkerboven-
    // hoek. Forceer een resize na de eerste paint en bij elke container-maat-
    // wijziging (embeds zitten doorgaans in een iframe dat schaalt). Bewust
    // géén disconnect: dit component ruimt (zie boven) niets op om StrictMode-
    // remounts te overleven, en de embed-pagina heeft één kaart die niet
    // unmount.
    const forceResize = () => map.resize();
    requestAnimationFrame(forceResize);
    map.once("load", forceResize);
    if (typeof ResizeObserver !== "undefined" && containerRef.current) {
      new ResizeObserver(forceResize).observe(containerRef.current);
    }
  }, [coordinates]);

  return <div ref={containerRef} className="h-full w-full" />;
}
