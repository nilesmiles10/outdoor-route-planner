// GPX 1.1 build/parse. Export targets Garmin/Wahoo import compatibility:
// a single <trk> with elevation, plus <wpt> entries for the waypoints.

export type GpxWaypoint = { name: string; lon: number; lat: number };

function esc(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildGpx(
  name: string,
  coords: GeoJSON.Position[],
  elevation: number[],
  waypoints: GpxWaypoint[],
): string {
  const wpts = waypoints
    .map(
      (w) =>
        `  <wpt lat="${w.lat.toFixed(6)}" lon="${w.lon.toFixed(6)}"><name>${esc(w.name)}</name></wpt>`,
    )
    .join("\n");
  const pts = coords
    .map((c, i) => {
      const ele = elevation[i] !== undefined ? `<ele>${elevation[i].toFixed(1)}</ele>` : "";
      return `      <trkpt lat="${c[1].toFixed(6)}" lon="${c[0].toFixed(6)}">${ele}</trkpt>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Outdoor Route Planner" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>${esc(name)}</name></metadata>
${wpts}
  <trk>
    <name>${esc(name)}</name>
    <trkseg>
${pts}
    </trkseg>
  </trk>
</gpx>
`;
}

// Parse a GPX file and return its track points (falls back to route points
// or waypoints when there is no track).
export function parseGpx(xml: string): GeoJSON.Position[] {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.querySelector("parsererror")) return [];
  const collect = (selector: string) =>
    Array.from(doc.querySelectorAll(selector)).map((el) => [
      parseFloat(el.getAttribute("lon") ?? ""),
      parseFloat(el.getAttribute("lat") ?? ""),
    ]) as GeoJSON.Position[];
  let pts = collect("trkpt");
  if (pts.length === 0) pts = collect("rtept");
  if (pts.length === 0) pts = collect("wpt");
  return pts.filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
}

// Reduce an imported track to a handful of evenly spaced anchor points that
// the router can re-snap to the network (first + last always included).
export function sampleAnchors(
  pts: GeoJSON.Position[],
  count = 6,
): GeoJSON.Position[] {
  if (pts.length <= count) return pts;
  const out: GeoJSON.Position[] = [];
  for (let i = 0; i < count; i++) {
    out.push(pts[Math.round((i / (count - 1)) * (pts.length - 1))]);
  }
  return out;
}
