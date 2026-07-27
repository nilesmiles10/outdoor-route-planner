"use client";

import { addProtocol } from "maplibre-gl";
import { Protocol } from "pmtiles";
import { layers, namedFlavor } from "@protomaps/basemaps";
import type { StyleSpecification } from "maplibre-gl";

// Basemap source. OpenFreeMap is free and needs no key, but it has stalled
// repeatedly in production (style fetch hanging, blank maps) — see the
// resilience workarounds in MapView/HighlightMap. Setting
// NEXT_PUBLIC_PMTILES_URL switches to our own Europe .pmtiles archive on the
// VPS, served by nginx as a static file over HTTP range requests.
//
// Flag-gated on purpose: the two look different, so the switch is a
// deliberate choice rather than a side effect of a deploy.
const OPENFREEMAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";
const PMTILES_URL = process.env.NEXT_PUBLIC_PMTILES_URL;

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

export function mapStyle(lang: string = "nl"): string | StyleSpecification {
  if (!PMTILES_URL) return OPENFREEMAP_STYLE;
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

export const usingSelfHostedTiles = Boolean(PMTILES_URL);
