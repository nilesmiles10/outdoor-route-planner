// GEN-117 — completed activities. Parse a recorded GPX/FIT track into the
// tour-compatible shape (coords + elevation + per-point time offsets) and
// derive activity stats. Design notes:
// - moving time: a segment counts as moving when its speed is >= 1 km/h;
//   segment gaps > 120 s (auto-pause, tunnel) never count as moving.
// - max speed: taken over a ~15 s rolling window instead of raw point pairs,
//   so single GPS spikes don't produce a fake 90 km/h max.
// - tracks are downsampled to <= MAX_POINTS (1 Hz recordings easily reach
//   10k+ points; storage and chart don't need that resolution).

export type ParsedActivity = {
  coords: GeoJSON.Position[];
  elevation: number[]; // metres, 0-filled when the file has none
  timeOffsets: number[]; // seconds since start, aligned with coords
  startISO: string;
  name: string | null; // from file metadata, if any
  hasElevation: boolean;
};

export type ActivityStats = {
  distanceM: number;
  ascendM: number;
  descendM: number;
  durationS: number; // elapsed
  movingS: number;
  maxSpeedKmh: number;
};

const MAX_POINTS = 1500;
const MOVING_MIN_KMH = 1;
const PAUSE_GAP_S = 120;

function haversineM(a: GeoJSON.Position, b: GeoJSON.Position): number {
  const R = 6371000;
  const dLat = ((b[1] - a[1]) * Math.PI) / 180;
  const dLon = ((b[0] - a[0]) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a[1] * Math.PI) / 180) *
      Math.cos((b[1] * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function downsample(act: ParsedActivity): ParsedActivity {
  const n = act.coords.length;
  if (n <= MAX_POINTS) return act;
  const stride = Math.ceil(n / MAX_POINTS);
  const keep = (i: number) => i % stride === 0 || i === n - 1;
  return {
    ...act,
    coords: act.coords.filter((_, i) => keep(i)),
    elevation: act.elevation.filter((_, i) => keep(i)),
    timeOffsets: act.timeOffsets.filter((_, i) => keep(i)),
  };
}

function finalize(
  raw: {
    coords: GeoJSON.Position[];
    ele: (number | null)[];
    times: Date[];
    name: string | null;
  },
): ParsedActivity | null {
  if (raw.coords.length < 2) return null;
  const start = raw.times[0].getTime();
  const hasElevation = raw.ele.some((e) => e !== null);
  // Fill missing elevation with the previous known value (0 at the start).
  let last = 0;
  const elevation = raw.ele.map((e) => {
    if (e !== null && Number.isFinite(e)) last = e;
    return Math.round(last * 10) / 10;
  });
  return downsample({
    coords: raw.coords,
    elevation,
    timeOffsets: raw.times.map((t) => Math.round((t.getTime() - start) / 1000)),
    startISO: raw.times[0].toISOString(),
    name: raw.name,
    hasElevation,
  });
}

// GPX with per-point <time> (any recording app / head unit export).
// Returns null when the file has no usable timestamps — that's a planned
// route; the planner's Import GPX flow handles those.
export function parseActivityGpx(xml: string): ParsedActivity | null {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.querySelector("parsererror")) return null;
  const pts = Array.from(doc.querySelectorAll("trkpt"));
  const coords: GeoJSON.Position[] = [];
  const ele: (number | null)[] = [];
  const times: Date[] = [];
  for (const el of pts) {
    const lon = parseFloat(el.getAttribute("lon") ?? "");
    const lat = parseFloat(el.getAttribute("lat") ?? "");
    const t = el.querySelector("time")?.textContent;
    if (!Number.isFinite(lon) || !Number.isFinite(lat) || !t) continue;
    const d = new Date(t);
    if (Number.isNaN(d.getTime())) continue;
    coords.push([lon, lat]);
    const e = parseFloat(el.querySelector("ele")?.textContent ?? "");
    ele.push(Number.isFinite(e) ? e : null);
    times.push(d);
  }
  const name =
    doc.querySelector("trk > name")?.textContent?.trim() ||
    doc.querySelector("metadata > name")?.textContent?.trim() ||
    null;
  return finalize({ coords, ele, times, name });
}

// FIT (Garmin/Wahoo native). fit-file-parser converts semicircles to degrees
// by default; the |lat| > 90 guard converts raw semicircles anyway in case a
// file slips through unconverted.
export async function parseActivityFit(
  buf: ArrayBuffer,
): Promise<ParsedActivity | null> {
  const { default: FitParser } = await import("fit-file-parser");
  const parser = new FitParser({
    force: true,
    mode: "list",
    speedUnit: "km/h",
    lengthUnit: "m",
  });
  let data: { records?: unknown[] };
  try {
    data = (await parser.parseAsync(buf)) as { records?: unknown[] };
  } catch {
    return null;
  }
  type Rec = {
    position_lat?: number;
    position_long?: number;
    altitude?: number;
    enhanced_altitude?: number;
    timestamp?: string | Date;
  };
  const semi = (v: number) => (Math.abs(v) > 90 ? v * (180 / 2 ** 31) : v);
  const coords: GeoJSON.Position[] = [];
  const ele: (number | null)[] = [];
  const times: Date[] = [];
  for (const r of (data.records ?? []) as Rec[]) {
    if (
      r.position_lat === undefined ||
      r.position_long === undefined ||
      !r.timestamp
    )
      continue;
    const d = new Date(r.timestamp);
    if (Number.isNaN(d.getTime())) continue;
    coords.push([semi(r.position_long), semi(r.position_lat)]);
    const a = r.enhanced_altitude ?? r.altitude;
    ele.push(a !== undefined && Number.isFinite(a) ? a : null);
    times.push(d);
  }
  return finalize({ coords, ele, times, name: null });
}

export function computeActivityStats(act: ParsedActivity): ActivityStats {
  const { coords, elevation, timeOffsets } = act;
  let distanceM = 0;
  let ascendM = 0;
  let descendM = 0;
  let movingS = 0;
  const segDist: number[] = [0];
  for (let i = 1; i < coords.length; i++) {
    const d = haversineM(coords[i - 1], coords[i]);
    segDist.push(d);
    distanceM += d;
    const dt = timeOffsets[i] - timeOffsets[i - 1];
    if (dt > 0 && dt <= PAUSE_GAP_S) {
      const kmh = (d / dt) * 3.6;
      if (kmh >= MOVING_MIN_KMH) movingS += dt;
    }
    // Guard misaligned/missing elevation — one NaN would poison the sums.
    const de = (elevation[i] ?? 0) - (elevation[i - 1] ?? 0);
    if (!Number.isFinite(de)) continue;
    if (de > 0) ascendM += de;
    else descendM -= de;
  }
  // Max speed, GPS-spike resistant in two layers:
  // 1. per-point speed = straight-line displacement i-1 → i+1 (centered):
  //    a spike point itself gets a clean value because the displacement
  //    skips it; only its two neighbours read inflated.
  // 2. rolling minimum over 3 consecutive centered values: a single-point
  //    spike never inflates 3 in a row, so the min stays honest. Real
  //    sprints shorter than ~3 samples get clipped — acceptable.
  const centered: number[] = [];
  for (let i = 1; i < coords.length - 1; i++) {
    const dt = timeOffsets[i + 1] - timeOffsets[i - 1];
    if (dt > 0 && dt <= PAUSE_GAP_S) {
      centered.push((haversineM(coords[i - 1], coords[i + 1]) / dt) * 3.6);
    } else {
      centered.push(0);
    }
  }
  let maxSpeedKmh = 0;
  for (let i = 2; i < centered.length; i++) {
    maxSpeedKmh = Math.max(
      maxSpeedKmh,
      Math.min(centered[i - 2], centered[i - 1], centered[i]),
    );
  }
  return {
    distanceM: Math.round(distanceM),
    ascendM: Math.round(ascendM),
    descendM: Math.round(descendM),
    durationS: timeOffsets[timeOffsets.length - 1] - timeOffsets[0],
    movingS,
    maxSpeedKmh: Math.round(maxSpeedKmh * 10) / 10,
  };
}

// Per-point speed series (km/h) for the speed chart, smoothed over a short
// time window so 1 Hz jitter doesn't make the chart unreadable.
export function speedSeries(
  coords: GeoJSON.Position[],
  timeOffsets: number[],
  windowS = 20,
): number[] {
  const n = coords.length;
  const cum: number[] = [0];
  for (let i = 1; i < n; i++) cum.push(cum[i - 1] + haversineM(coords[i - 1], coords[i]));
  const out: number[] = [];
  let j = 0;
  for (let i = 0; i < n; i++) {
    while (timeOffsets[i] - timeOffsets[j] > windowS && j < i) j++;
    const dt = timeOffsets[i] - timeOffsets[j];
    out.push(dt > 0 ? ((cum[i] - cum[j]) / dt) * 3.6 : 0);
  }
  return out;
}

export function fmtDuration(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return `${h}:${String(m).padStart(2, "0")}`;
}
