// Group raw OSM highway values into Komoot-style waytype buckets.
// Gedeeld door de planner (live route) én de tour/trail-detailpagina's
// (opgeslagen route.waytypes), zodat de indeling niet uit elkaar loopt.
// Waarden zijn meters per OSM-highway-tag; labels via i18n planner.wt.*.
const WAYTYPE_GROUPS: Record<string, string> = {
  cycleway: "cycleway",
  path: "path",
  footway: "path",
  bridleway: "path",
  steps: "steps",
  track: "track",
  residential: "street",
  living_street: "street",
  pedestrian: "street",
  service: "access",
  unclassified: "road",
  tertiary: "road",
  tertiary_link: "road",
  secondary: "road",
  secondary_link: "road",
  primary: "road",
  primary_link: "road",
  trunk: "road",
  trunk_link: "road",
  motorway: "road",
  motorway_link: "road",
  busway: "road",
  road: "road", // generieke highway=road
  via_ferrata: "path",
  corridor: "path",
  // Ongetagde ways (route API zet highway ?? "unknown"): apart tonen i.p.v. op
  // één hoop met "Overig" (constructie, perron, ...) — parallel aan de
  // ondergrond-balk die "Onbekend" ook los toont.
  unknown: "unknown",
};

export function groupWaytypes(
  waytypes: Record<string, number>,
): [string, number][] {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(waytypes)) {
    const g = WAYTYPE_GROUPS[k] ?? "other";
    out[g] = (out[g] ?? 0) + v;
  }
  return Object.entries(out).sort((a, b) => b[1] - a[1]);
}
