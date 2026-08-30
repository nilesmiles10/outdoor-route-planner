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
  // Eigen profiel (infra/brouter/run.brf, op de VPS). Basis = hiking-mountain;
  // twee wijzigingen: SAC_scale_limit 3->2 (geen blootgestelde T3-scrambling
  // voor hardlopers) + consider_elevation aan (loopbare, vlakkere routes).
  // Subtiel op normaal terrein (een run en een hike over hetzelfde pad zijn
  // dezelfde route); zichtbaar in heuvel-/alpien terrein. v1. Pace-model blijft
  // client-side.
  run: "run",
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
  // Eigen profiel (infra/brouter/ebike.brf, op de VPS in profiles2/). Basis =
  // trekking; twee gemotiveerde e-bike-wijzigingen: downhillcost 60->20 (de
  // motor maakt hoogtemeters "goedkoper", dus minder terrein-mijden — trekking
  // heeft uphillcost al op 0) en bikerPower 100->250 W (reële ETA met assist,
  // bv. Innsbruck->Seefeld 152->74 min). Overige kosten identiek aan trekking,
  // dus geen regressie in weg-/ondergrondkeuze. v1, veldtuning volgt.
  ebike: "ebike",
} as const;

export type Sport = keyof typeof SPORT_PROFILES;

export function isSport(v: string): v is Sport {
  return v in SPORT_PROFILES;
}

// Sport-families voor relevantie-ranking van gerelateerde routes. Een racefietser
// vindt een gravel-/mtb-/toerroute in de buurt interessanter dan een wandelroute,
// ook al ligt die iets verder — en andersom voor een wandelaar. Voet = hike/run,
// fiets = de rest (touring/gravel/mtb/road/ebike). Gebruikt door de "Ook
// interessant"-sorts op de tour-/trail-pagina's: exact sport eerst, dan zelfde
// familie, dan pas de andere familie (elk daarbinnen op afstand).
const FOOT_SPORTS = new Set<string>(["hike", "run"]);
export function sportFamily(sport: string): "foot" | "bike" {
  return FOOT_SPORTS.has(sport) ? "foot" : "bike";
}

// OSM surface tag → bucket for the breakdown bars (GEN-106).
const PAVED = new Set([
  "asphalt",
  "paved",
  "concrete",
  "paving_stones",
  "sett",
  "cobblestone",
  "unhewn_cobblestone", // ruwe kei — cobblestone-familie, constructie-steen
  "chipseal", // bitumineuze slijtlaag = verhard
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
  "soil",
  "grass",
  "sand",
  "mud",
  "pebblestone",
  "rock",
  "bare_rock",
  "scree",
  "woodchips",
  "shells",
  "crushed_shells",
]);

export function surfaceBucket(surface: string | undefined) {
  if (!surface) return "unknown";
  // Samengestelde/variant-tags reduceren tot hun basis vóór lookup: OSM gebruikt
  // ; en / voor gemengde ondergronden ("gravel;ground", "dirt/sand") en : voor
  // subtypes ("asphalt:lanes", "concrete:plates"). Zonder dit telden die
  // onterecht als "onbekend" op de ondergrond-balk (bv. 360 km unhewn_cobble-
  // stone, 60 km paving_stones:lanes). Classificeer op het eerste segment.
  const base = surface.split(/[;/:]/)[0].trim();
  if (PAVED.has(base)) return "paved";
  if (UNPAVED.has(base)) return "unpaved";
  return "unknown";
}
