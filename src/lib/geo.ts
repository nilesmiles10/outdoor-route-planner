// Server-side config for the VPS geo-services (BRouter + Photon).
// Dev: SSH tunnel to localhost. Prod: nginx path on novactrl.nl + X-Geo-Key.
export const GEO_ROUTE_BASE =
  process.env.GEO_ROUTE_BASE ?? "http://127.0.0.1:17777/brouter";
export const GEO_SEARCH_BASE =
  process.env.GEO_SEARCH_BASE ?? "http://127.0.0.1:2322/api";
export const GEO_REVERSE_BASE =
  process.env.GEO_REVERSE_BASE ??
  (process.env.GEO_SEARCH_BASE
    ? process.env.GEO_SEARCH_BASE.replace(/\/(api|search)$/, "/reverse")
    : "http://127.0.0.1:2322/reverse");
export const GEO_KEY = process.env.GEO_KEY ?? "";

export function geoHeaders(): HeadersInit {
  return GEO_KEY ? { "X-Geo-Key": GEO_KEY } : {};
}

// Our 7 sports → BRouter profiles. Tuning/custom profiles = GEN-104.
export const SPORT_PROFILES = {
  hike: "hiking-mountain",
  run: "hiking-mountain", // no native run profile; speed model differs client-side
  touring: "trekking",
  // Eigen profiel (infra/brouter/gravel-nl.brf, staat op de VPS in
  // profiles2/). Upstream gravel.brf heeft prefer_unpaved_paths uit staan én
  // prijst asfalt (1.1) goedkoper dan gravel (1.5), dus het zoekt gravel niet
  // op. Gemeten over 9 NL-rondjes van 40 km: mediaan onverhard 17% -> 35%.
  // Bewuste ruil: zand gaat van 0,0 naar 0,6 km mediaan (upstream reed simpel-
  // weg nauwelijks onverhard); het mtb-profiel zit op 40% maar met 4,5 km zand.
  // Terug naar upstream = deze waarde weer op "gravel" zetten.
  gravel: "gravel-nl",
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
