// Elevation utilities: cumulative distances, smoothing, climb detection.
// Climb algorithm (documented per werkgewoonte #10):
//   1. Smooth elevation with a centered moving average (window 5 samples)
//      to suppress DEM noise.
//   2. Walk the profile; a climb starts when gradient over the lookahead
//      stretch is >= MIN_GRADE and accumulates while the trend holds.
//   3. Climbs closer together than MERGE_GAP_M with little descent between
//      them are merged (a flat bend in a col is still one climb).
//   4. Keep climbs with gain >= MIN_GAIN_M. Parameters chosen to match
//      what a cyclist would call "a climb" in NL/BE terrain and the Alps
//      alike; tune with real rides later (GEN-104 territory).

export type Climb = {
  startIdx: number;
  endIdx: number;
  startM: number;
  lengthM: number;
  gainM: number;
  avgPct: number;
};

const MIN_GAIN_M = 20;
const MIN_GRADE = 0.02; // 2%
const MERGE_GAP_M = 300;
const MERGE_MAX_DROP_M = 10;

export function cumulativeDistances(coords: GeoJSON.Position[]): number[] {
  const out = [0];
  for (let i = 1; i < coords.length; i++) {
    out.push(out[i - 1] + haversineM(coords[i - 1], coords[i]));
  }
  return out;
}

function haversineM(a: GeoJSON.Position, b: GeoJSON.Position): number {
  const R = 6371000;
  const dLat = ((b[1] - a[1]) * Math.PI) / 180;
  const dLon = ((b[0] - a[0]) * Math.PI) / 180;
  const la1 = (a[1] * Math.PI) / 180;
  const la2 = (b[1] * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function smooth(elev: number[], window = 5): number[] {
  const half = Math.floor(window / 2);
  return elev.map((_, i) => {
    let sum = 0;
    let n = 0;
    for (let j = Math.max(0, i - half); j <= Math.min(elev.length - 1, i + half); j++) {
      sum += elev[j];
      n++;
    }
    return sum / n;
  });
}

export function detectClimbs(elevRaw: number[], dist: number[]): Climb[] {
  if (elevRaw.length < 3) return [];
  const elev = smooth(elevRaw);
  const raw: Climb[] = [];
  let start = -1;

  for (let i = 1; i < elev.length; i++) {
    const rising = elev[i] > elev[i - 1];
    if (rising && start === -1) start = i - 1;
    const flatOrDown = !rising;
    const atEnd = i === elev.length - 1;
    if (start !== -1 && (flatOrDown || atEnd)) {
      const end = atEnd && rising ? i : i - 1;
      const gain = elev[end] - elev[start];
      const len = dist[end] - dist[start];
      if (gain > 2 && len > 0) {
        raw.push({
          startIdx: start,
          endIdx: end,
          startM: dist[start],
          lengthM: len,
          gainM: gain,
          avgPct: (gain / len) * 100,
        });
      }
      start = -1;
    }
  }

  // Merge nearby climbs
  const merged: Climb[] = [];
  for (const c of raw) {
    const prev = merged[merged.length - 1];
    if (prev) {
      const gapM = c.startM - (prev.startM + prev.lengthM);
      const dropM = elev[prev.endIdx] - elev[c.startIdx];
      if (gapM <= MERGE_GAP_M && dropM <= MERGE_MAX_DROP_M) {
        prev.endIdx = c.endIdx;
        prev.lengthM = dist[c.endIdx] - prev.startM;
        prev.gainM += c.gainM;
        prev.avgPct = (prev.gainM / prev.lengthM) * 100;
        continue;
      }
    }
    merged.push({ ...c });
  }

  return merged.filter(
    (c) => c.gainM >= MIN_GAIN_M && c.avgPct >= MIN_GRADE * 100,
  );
}
