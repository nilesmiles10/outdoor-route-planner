// Difficulty formula (documented, GEN-106; extracted for reuse in GEN-132):
//   bike: effort = km + ascent/50   ("100 m climbing ≈ 2 extra km")
//   foot: effort = km + ascent/100  (walking absorbs climbs relatively better
//                                    per km, but thresholds are much lower)
// Calibration reference (2026-07-19): Utrecht→Amersfoort touring
// (21.6 km/32 m → easy, matches Komoot), La Roche→Houffalize touring
// (27.9 km/442 m → moderate), Den Haag→Utrecht (66 km → moderate).

export type Difficulty = "easy" | "moderate" | "hard";

export function difficulty(
  sport: string,
  distanceM: number,
  ascendM: number,
): Difficulty {
  const onFoot = sport === "hike" || sport === "run";
  const effort = distanceM / 1000 + ascendM / (onFoot ? 100 : 50);
  const [easyMax, moderateMax] = onFoot ? [10, 20] : [30, 70];
  if (effort <= easyMax) return "easy";
  if (effort <= moderateMax) return "moderate";
  return "hard";
}
