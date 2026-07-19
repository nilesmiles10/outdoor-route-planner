// Server-side config for the VPS geo-services (BRouter + Photon).
// Dev: SSH tunnel to localhost. Prod: nginx path on novactrl.nl + X-Geo-Key.
export const GEO_ROUTE_BASE =
  process.env.GEO_ROUTE_BASE ?? "http://127.0.0.1:17777/brouter";
export const GEO_SEARCH_BASE =
  process.env.GEO_SEARCH_BASE ?? "http://127.0.0.1:2322/api";
export const GEO_KEY = process.env.GEO_KEY ?? "";

export function geoHeaders(): HeadersInit {
  return GEO_KEY ? { "X-Geo-Key": GEO_KEY } : {};
}

// Our 7 sports → BRouter profiles. Tuning/custom profiles = GEN-104.
export const SPORT_PROFILES = {
  hike: "hiking-mountain",
  run: "hiking-mountain", // no native run profile; speed model differs client-side
  touring: "trekking",
  gravel: "gravel",
  mtb: "mtb",
  road: "fastbike",
  ebike: "trekking", // custom e-bike cost function comes with GEN-104
} as const;

export type Sport = keyof typeof SPORT_PROFILES;

export function isSport(v: string): v is Sport {
  return v in SPORT_PROFILES;
}

// OSM surface tag → bucket for the breakdown bars (GEN-106).
const PAVED = new Set([
  "asphalt",
  "paved",
  "concrete",
  "concrete:plates",
  "concrete:lanes",
  "paving_stones",
  "sett",
  "cobblestone",
  "metal",
  "wood",
]);
const UNPAVED = new Set([
  "gravel",
  "fine_gravel",
  "compacted",
  "unpaved",
  "ground",
  "dirt",
  "earth",
  "grass",
  "sand",
  "mud",
  "pebblestone",
  "rock",
  "woodchips",
]);

export function surfaceBucket(surface: string | undefined) {
  if (!surface) return "unknown";
  if (PAVED.has(surface)) return "paved";
  if (UNPAVED.has(surface)) return "unpaved";
  return "unknown";
}
