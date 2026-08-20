// GEN-137 — Komoot-style "Places" POI toggles. These render straight from the
// basemap's own OpenMapTiles vector tiles (source "openmaptiles", source-layer
// "poi", fields `class`/`subclass`) — no extra data fetch, exactly how Komoot
// does it. Verified against the live tilejson: the `poi` layer carries `class`
// (grouped OpenMapTiles class) + `subclass` (the raw OSM tag), from ~z13.
//
// We filter on BOTH class and subclass so a category is unlikely to silently
// show nothing. POIs only exist in the tiles from ~z13, so the map layers are
// minzoom-gated (visible only when zoomed in — same as Komoot).
//
// These filter the OpenMapTiles schema, which is our PRIMARY basemap
// (OpenFreeMap). During a basemap failover to the self-hosted protomaps tiles
// (see mapStyle.ts) the `openmaptiles` source is absent, so the POI layers are
// skipped — acceptable, POIs are secondary to having any map during an outage.
import type { FilterSpecification } from "maplibre-gl";

export type PoiCategory = {
  id: string;
  color: string;
  classes: string[];
  subclasses: string[];
};

// Curated first batch: the places hikers / cyclists actually look for. The rest
// of Komoot's ~22 categories follow the same shape.
export const POI_CATEGORIES: PoiCategory[] = [
  { id: "water", color: "#0ea5e9", classes: [], subclasses: ["drinking_water", "water_point"] },
  {
    id: "food",
    color: "#ef4444",
    classes: [],
    subclasses: ["restaurant", "fast_food", "cafe", "bar", "pub", "biergarten", "food_court", "ice_cream", "cafeteria"],
  },
  { id: "toilets", color: "#8b5cf6", classes: [], subclasses: ["toilets"] },
  { id: "parking", color: "#3b82f6", classes: [], subclasses: ["parking"] },
  {
    id: "lodging",
    color: "#f59e0b",
    classes: ["lodging"],
    subclasses: ["hotel", "hostel", "guest_house", "motel", "chalet", "apartment", "bed_and_breakfast"],
  },
  {
    id: "shelter",
    color: "#10b981",
    classes: [],
    subclasses: ["shelter", "alpine_hut", "wilderness_hut", "basic_hut", "lean_to", "weather_shelter"],
  },
  { id: "camp", color: "#22c55e", classes: ["campsite"], subclasses: ["camp_site", "caravan_site"] },
  { id: "bike", color: "#14b8a6", classes: [], subclasses: ["bicycle"] },
];

// MapLibre expression filter: match either the grouped `class` or the raw
// `subclass` against this category's value lists.
export function poiFilter(cat: PoiCategory): FilterSpecification {
  const clauses: unknown[] = [];
  if (cat.classes.length) clauses.push(["in", ["get", "class"], ["literal", cat.classes]]);
  if (cat.subclasses.length) clauses.push(["in", ["get", "subclass"], ["literal", cat.subclasses]]);
  return ["any", ...clauses] as unknown as FilterSpecification;
}
