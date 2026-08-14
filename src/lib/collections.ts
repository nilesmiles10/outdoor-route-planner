// GEN-114 Collections — shared types + presentation helpers.
// Collections group ordered tours with an intro + per-stage notes. We have no
// photo-upload infra yet, so covers fall back to a sport-keyed gradient.

export type Sport =
  | "hike"
  | "run"
  | "touring"
  | "gravel"
  | "mtb"
  | "road"
  | "ebike";

export const SPORT_EMOJI: Record<string, string> = {
  hike: "🥾",
  run: "🏃",
  touring: "🚲",
  gravel: "🚵",
  mtb: "⛰️",
  road: "🚴",
  ebike: "⚡",
};

// Deterministic gradient per sport — used as a cover placeholder until cover_url exists.
export const SPORT_GRADIENT: Record<string, string> = {
  hike: "from-emerald-500 to-teal-700",
  run: "from-orange-500 to-rose-600",
  touring: "from-sky-500 to-indigo-700",
  gravel: "from-amber-500 to-orange-700",
  mtb: "from-lime-600 to-green-800",
  road: "from-blue-500 to-cyan-700",
  ebike: "from-violet-500 to-fuchsia-700",
};

export function gradientFor(sport?: string): string {
  return (sport && SPORT_GRADIENT[sport]) || "from-emerald-600 to-teal-800";
}

/** Aggregate distance (m) + ascent (m) over a list of tour stats. */
export function aggregateStats(
  stats: { distanceM?: number; ascendM?: number }[],
): { distanceM: number; ascendM: number } {
  return stats.reduce<{ distanceM: number; ascendM: number }>(
    (a, s) => ({
      distanceM: a.distanceM + (s.distanceM ?? 0),
      ascendM: a.ascendM + (s.ascendM ?? 0),
    }),
    { distanceM: 0, ascendM: 0 },
  );
}

/**
 * Build a normalized SVG path string from lon/lat coordinates, fit into a w×h box
 * with a small padding. Latitude is flipped (SVG y grows downward). Returns "" if
 * there are too few points.
 */
// Max aantal punten in een thumbnail-pad. Een 80px-vorm heeft geen 300+ punten
// nodig; ~48 ziet er identiek uit maar scheelt ~10x aan SVG-path-DOM over álle
// thumbnails samen (discover-grid, collectie-kaarten/hero, profiel-tijdlijn).
const THUMB_PTS = 48;

// Gelijkmatig downsamplen met behoud van eerste + laatste punt. De bounding box
// blijft bewust op de vólle coords (in de aanroepers) zodat de uitsnede exact
// hetzelfde blijft — alleen het aantal tussenpunten daalt.
function sampleCoords(
  coords: readonly [number, number][],
  max: number,
): readonly [number, number][] {
  if (coords.length <= max) return coords;
  const step = (coords.length - 1) / (max - 1);
  const out: [number, number][] = [];
  for (let i = 0; i < max; i++) out.push(coords[Math.round(i * step)]);
  return out;
}

export function miniPath(
  coords: [number, number][] | undefined,
  w: number,
  h: number,
  pad = 4,
): string {
  if (!coords || coords.length < 2) return "";
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const [lon, lat] of coords) {
    if (lon < minX) minX = lon;
    if (lon > maxX) maxX = lon;
    if (lat < minY) minY = lat;
    if (lat > maxY) maxY = lat;
  }
  const spanX = maxX - minX || 1e-6;
  const spanY = maxY - minY || 1e-6;
  const iw = w - pad * 2;
  const ih = h - pad * 2;
  // preserve aspect ratio: scale by the tighter axis, center the other
  const scale = Math.min(iw / spanX, ih / spanY);
  const offX = pad + (iw - spanX * scale) / 2;
  const offY = pad + (ih - spanY * scale) / 2;
  return sampleCoords(coords, THUMB_PTS)
    .map(([lon, lat], i) => {
      const x = offX + (lon - minX) * scale;
      const y = offY + (maxY - lat) * scale; // flip
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

/**
 * Multiple routes normalized to ONE shared bounding box, so a collection can be
 * shown as a single overview (all route shapes in their relative positions —
 * clustered = one area, scattered = wide coverage). Returns one SVG path per
 * route (skips routes without usable geometry).
 */
export function multiMiniPaths(
  routes: (readonly [number, number][] | undefined)[],
  w: number,
  h: number,
  pad = 8,
): string[] {
  const usable = routes.filter(
    (c): c is [number, number][] => !!c && c.length >= 2,
  );
  if (!usable.length) return [];
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const coords of usable) {
    for (const [lon, lat] of coords) {
      if (lon < minX) minX = lon;
      if (lon > maxX) maxX = lon;
      if (lat < minY) minY = lat;
      if (lat > maxY) maxY = lat;
    }
  }
  const spanX = maxX - minX || 1e-6;
  const spanY = maxY - minY || 1e-6;
  const iw = w - pad * 2;
  const ih = h - pad * 2;
  const scale = Math.min(iw / spanX, ih / spanY);
  const offX = pad + (iw - spanX * scale) / 2;
  const offY = pad + (ih - spanY * scale) / 2;
  return usable.map((coords) =>
    sampleCoords(coords, THUMB_PTS)
      .map(([lon, lat], i) => {
        const x = offX + (lon - minX) * scale;
        const y = offY + (maxY - lat) * scale;
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" "),
  );
}
