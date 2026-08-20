// GEN-121 — multi-day stage splitting. Pure geometry: given an ordered route
// (coords + parallel elevation + cumulative distance) split it into N balanced
// day-stages and report per-stage distance / ascent / descent / time.
//
// "Balanced" = each stage gets an equal share of the TOTAL distance (total/N),
// rather than greedily filling target-km days and leaving a stub final day.
// The caller turns a "target km/day" preference into N via suggestDays().

export type Stage = {
  day: number; // 1-based
  startIdx: number; // inclusive route-coord index
  endIdx: number; // inclusive route-coord index
  distanceM: number;
  ascentM: number;
  descentM: number;
  timeS: number;
  start: [number, number];
  end: [number, number];
};

// Sensible default daily distance (km) per sport — hikers cover less ground
// than road cyclists. Starting points; the user overrides the day count.
export const DEFAULT_DAY_KM: Record<string, number> = {
  hike: 20,
  run: 20,
  touring: 80,
  gravel: 70,
  mtb: 45,
  road: 110,
  ebike: 90,
};

export function dayKmFor(sport: string): number {
  return DEFAULT_DAY_KM[sport] ?? 25;
}

// How many days a route "wants" at a given daily target. Always ≥ 1.
export function suggestDays(totalM: number, targetKmPerDay: number): number {
  if (totalM <= 0 || targetKmPerDay <= 0) return 1;
  return Math.max(1, Math.round(totalM / 1000 / targetKmPerDay));
}

export function splitIntoStages(
  coords: GeoJSON.Position[],
  elevation: number[],
  cumDist: number[], // metres, parallel to coords, monotonic non-decreasing
  totalTimeS: number,
  nDays: number,
  // Optional route totals (BRouter's own smoothed ascent/descent). When given,
  // per-stage ascent/descent is scaled so the stages sum EXACTLY to these —
  // otherwise raw elevation-delta sums overcount vs the headline figure and the
  // days visibly don't add up to the whole.
  totalAscentM?: number,
  totalDescentM?: number,
): Stage[] {
  const n = coords.length;
  if (n < 2 || nDays < 1) return [];
  const total = cumDist[n - 1] ?? 0;
  // Can't have more stages than there are segments between points.
  const days = Math.max(1, Math.min(Math.floor(nDays), n - 1));
  const stages: Stage[] = [];
  let startIdx = 0;

  for (let d = 1; d <= days; d++) {
    let endIdx: number;
    if (d === days) {
      endIdx = n - 1; // last stage always runs to the end
    } else {
      const targetCum = (total * d) / days;
      endIdx = startIdx;
      while (endIdx < n - 1 && (cumDist[endIdx] ?? 0) < targetCum) endIdx++;
      // Guarantee forward progress so every stage owns at least one segment
      // (and later stages still have points left to cover).
      if (endIdx <= startIdx) endIdx = startIdx + 1;
      const maxEnd = n - 1 - (days - d); // leave ≥1 segment per remaining stage
      if (endIdx > maxEnd) endIdx = maxEnd;
    }

    const distanceM = (cumDist[endIdx] ?? 0) - (cumDist[startIdx] ?? 0);
    let ascentM = 0;
    let descentM = 0;
    for (let i = startIdx + 1; i <= endIdx; i++) {
      const dz = (elevation[i] ?? 0) - (elevation[i - 1] ?? 0);
      if (dz > 0) ascentM += dz;
      else descentM += -dz;
    }
    const timeS = total > 0 ? (totalTimeS * distanceM) / total : 0;
    const s = coords[startIdx]!;
    const e = coords[endIdx]!;
    stages.push({
      day: d,
      startIdx,
      endIdx,
      distanceM,
      ascentM,
      descentM,
      timeS,
      start: [s[0], s[1]],
      end: [e[0], e[1]],
    });
    startIdx = endIdx;
  }

  // Reconcile per-stage ascent/descent with the route's official totals so the
  // days sum to the headline figure (raw deltas overcount from GPS noise).
  if (totalAscentM !== undefined || totalDescentM !== undefined) {
    const rawA = stages.reduce((t, s) => t + s.ascentM, 0);
    const rawD = stages.reduce((t, s) => t + s.descentM, 0);
    const fa = totalAscentM !== undefined && rawA > 0 ? totalAscentM / rawA : 1;
    const fd = totalDescentM !== undefined && rawD > 0 ? totalDescentM / rawD : 1;
    for (const s of stages) {
      s.ascentM *= fa;
      s.descentM *= fd;
    }
  }
  return stages;
}
