"use client";

import { addProtocol } from "maplibre-gl";
import { Protocol } from "pmtiles";
import { layers, namedFlavor } from "@protomaps/basemaps";
import type { Map as MlMap, StyleSpecification } from "maplibre-gl";

// Basemap sources, with automatic failover. OpenFreeMap is free and needs no
// key but its CDN has stalled repeatedly in production (style fetch hanging →
// `load` never fires → blank map). Our own Europe .pmtiles archive on the VPS
// (nginx static file, HTTP range requests, verified 206 + CORS) is the safety
// net: attachBasemapFallback() swaps to it when the primary never loads.
//
// Which one is PRIMARY is flag-gated on purpose (the two look different, so the
// default is a deliberate choice, not a deploy side effect): default primary is
// OpenFreeMap; set NEXT_PUBLIC_PMTILES_URL to make the self-hosted tiles primary
// instead. The other source is always the fallback.
const OPENFREEMAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";

// Our self-hosted Europe archive. Always available as the fallback URL even
// when it is not the primary, so the failover works without any env change.
const SELF_HOST_PMTILES = "https://novactrl.nl/tiles/europe.pmtiles";
const PMTILES_URL = process.env.NEXT_PUBLIC_PMTILES_URL || SELF_HOST_PMTILES;
// Self-host is primary only when the env var is explicitly set.
const SELF_HOST_PRIMARY = Boolean(process.env.NEXT_PUBLIC_PMTILES_URL);

// Fonts/sprites for the protomaps flavors. Small static assets; kept on the
// upstream asset host for now — self-host these too if they ever wobble.
const ASSETS = "https://protomaps.github.io/basemaps-assets";

let protocolRegistered = false;
function ensureProtocol() {
  if (protocolRegistered) return;
  // addProtocol is global to maplibre; registering twice throws in dev
  // (React strict mode mounts effects twice).
  // maplibre v5 exports addProtocol as a named function, not a method on
  // the default export — calling maplibregl.addProtocol() silently did
  // nothing here and the vector source never loaded.
  addProtocol("pmtiles", new Protocol().tile);
  protocolRegistered = true;
}

function pmtilesStyle(lang: string): StyleSpecification {
  ensureProtocol();
  return {
    version: 8,
    glyphs: `${ASSETS}/fonts/{fontstack}/{range}.pbf`,
    sprite: `${ASSETS}/sprites/v4/light`,
    sources: {
      protomaps: {
        type: "vector",
        url: `pmtiles://${PMTILES_URL}`,
        attribution:
          '<a href="https://openstreetmap.org/copyright">OpenStreetMap</a> · <a href="https://protomaps.com">Protomaps</a>',
      },
    },
    layers: layers("protomaps", namedFlavor("light"), { lang }),
  } as StyleSpecification;
}

// Primary basemap. Default = OpenFreeMap; NEXT_PUBLIC_PMTILES_URL flips it to
// the self-hosted tiles.
export function mapStyle(lang: string = "nl"): string | StyleSpecification {
  return SELF_HOST_PRIMARY ? pmtilesStyle(lang) : OPENFREEMAP_STYLE;
}

// The OTHER source — used for automatic failover when the primary basemap
// never comes up.
export function fallbackStyle(
  lang: string = "nl",
): string | StyleSpecification {
  return SELF_HOST_PRIMARY ? OPENFREEMAP_STYLE : pmtilesStyle(lang);
}

// Watch a freshly-created map and swap to the fallback source once if the
// primary basemap fails to load. The dominant production failure is a hanging
// style fetch (OpenFreeMap): `load` never fires and the map stays blank, so we
// arm a timeout and swap if the style has not loaded by then. A style-level
// error before the style is ready triggers the same swap. Components re-add
// their own overlay layers on the resulting `styledata` event, so route /
// highlight / alert layers survive the swap untouched.
//
// Scope: this catches the "style/tiles never load" mode (blank basemap). It
// deliberately does not try to detect a style that loaded but renders wrong.
export function attachBasemapFallback(
  map: MlMap,
  lang: string = "nl",
  timeoutMs: number = 8000,
): void {
  let swapped = false;
  const swap = () => {
    if (swapped || map.isStyleLoaded()) return;
    swapped = true;
    window.clearTimeout(timer);
    try {
      map.setStyle(fallbackStyle(lang));
    } catch {
      // Both sources unreachable — nothing more we can do; leave the map as is.
    }
  };
  const timer = window.setTimeout(swap, timeoutMs);
  // A clean load means the primary came up — disarm.
  map.on("load", () => window.clearTimeout(timer));
  // A hard error while the style is still not ready = primary basemap failure.
  map.on("error", () => {
    if (!map.isStyleLoaded()) swap();
  });
}

export const usingSelfHostedTiles = SELF_HOST_PRIMARY;
