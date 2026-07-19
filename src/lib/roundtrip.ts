// Round-trip synthesis (GEN-107). BRouter has no native loop support, so we
// sample via-points on a circle through the start:
//   - circle center lies at bearing θ, distance r from start
//   - two extra points on the circle at ±120° around it
//   - triangle perimeter ≈ 3·√3·r; road factor ≈ 1.25 → target ≈ 6.5·r
// The caller measures the actual routed distance once and calls again with
// `scale = target/actual` for one refinement round (±15% acceptance).

export function destinationPoint(
  lon: number,
  lat: number,
  bearingDeg: number,
  distM: number,
): GeoJSON.Position {
  const R = 6371000;
  const δ = distM / R;
  const θ = (bearingDeg * Math.PI) / 180;
  const φ1 = (lat * Math.PI) / 180;
  const λ1 = (lon * Math.PI) / 180;
  const φ2 = Math.asin(
    Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ),
  );
  const λ2 =
    λ1 +
    Math.atan2(
      Math.sin(θ) * Math.sin(δ) * Math.cos(φ1),
      Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2),
    );
  return [((λ2 * 180) / Math.PI + 540) % 360 - 180, (φ2 * 180) / Math.PI];
}

export function loopVias(
  start: GeoJSON.Position,
  targetM: number,
  bearingDeg: number,
  scale = 1,
): [GeoJSON.Position, GeoJSON.Position] {
  const r = (targetM / 6.5) * scale;
  const center = destinationPoint(start[0], start[1], bearingDeg, r);
  // Bearing from center back to start
  const back = (bearingDeg + 180) % 360;
  const p1 = destinationPoint(center[0], center[1], (back + 120) % 360, r);
  const p2 = destinationPoint(center[0], center[1], (back + 240) % 360, r);
  return [p1, p2];
}
