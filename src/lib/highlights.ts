// GEN-115 Highlights — shared types + presentation constants.
// A highlight is a community POI (point now; segment supported in the data
// model, creation UI deferred). Seeded from OSM peaks/viewpoints/huts.

export const HIGHLIGHT_CATEGORIES = [
  "peak",
  "viewpoint",
  "hut",
  "water",
  "cafe",
  "monument",
  "nature",
  "other",
] as const;
export type HighlightCategory = (typeof HIGHLIGHT_CATEGORIES)[number];

export const CATEGORY_EMOJI: Record<string, string> = {
  peak: "⛰️",
  viewpoint: "🔭",
  hut: "🛖",
  water: "💧",
  cafe: "☕",
  monument: "🏛️",
  nature: "🌳",
  other: "📍",
};

// Marker dot colors per category (MapLibre match expression uses these too).
export const CATEGORY_COLOR: Record<string, string> = {
  peak: "#b45309",
  viewpoint: "#0284c7",
  hut: "#92400e",
  water: "#0ea5e9",
  cafe: "#db2777",
  monument: "#7c3aed",
  nature: "#16a34a",
  other: "#dc2626",
};

export type HighlightPoint = {
  id: string;
  name: string;
  category: string;
  lon: number;
  lat: number;
  description: string | null;
};

export function toFeatureCollection(
  rows: HighlightPoint[],
): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: rows.map((h) => ({
      type: "Feature",
      properties: {
        id: h.id,
        name: h.name,
        category: h.category,
        description: h.description ?? "",
      },
      geometry: { type: "Point", coordinates: [h.lon, h.lat] },
    })),
  };
}
