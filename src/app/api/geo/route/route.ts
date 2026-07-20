import { NextRequest, NextResponse } from "next/server";
import { checkLimit, clientIp } from "@/lib/ratelimit";
import {
  GEO_ROUTE_BASE,
  geoHeaders,
  isSport,
  SPORT_PROFILES,
  surfaceBucket,
} from "@/lib/geo";

export const dynamic = "force-dynamic";

// GET /api/geo/route?points=4.30,52.07|5.12,52.09&sport=gravel
// Proxies BRouter and returns geometry + stats + surface/waytype breakdown.
export async function GET(req: NextRequest) {
  const rl = await checkLimit("geo-route", clientIp(req), 30);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterS) } },
    );
  }
  const points = req.nextUrl.searchParams.get("points");
  const sport = req.nextUrl.searchParams.get("sport") ?? "touring";
  if (!points || !isSport(sport)) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const lonlats = points
    .split("|")
    .map((p) => p.trim())
    .filter(Boolean);
  if (lonlats.length < 2 || lonlats.length > 10) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const url = new URL(GEO_ROUTE_BASE);
  url.searchParams.set("lonlats", lonlats.join("|"));
  url.searchParams.set("profile", SPORT_PROFILES[sport]);
  url.searchParams.set("alternativeidx", "0");
  url.searchParams.set("format", "geojson");

  try {
    const res = await fetch(url, { headers: geoHeaders(), cache: "no-store" });
    const body = await res.text();
    if (!res.ok || !body.startsWith("{")) {
      // BRouter returns plain-text errors (e.g. "position not mapped")
      return NextResponse.json(
        { error: "no_route", detail: body.slice(0, 200) },
        { status: 422 },
      );
    }
    const data = JSON.parse(body);
    const feature = data.features?.[0];
    if (!feature) {
      return NextResponse.json({ error: "no_route" }, { status: 422 });
    }
    const props = feature.properties;

    // Per-point elevation from the 3rd coordinate (GEN-101/105 data source)
    const coords: [number, number, number?][] = feature.geometry.coordinates;
    const elevation = coords.map((c) => c[2] ?? 0);

    // GEN-129: which restriction tags warrant a warning for this sport.
    // Scope (spike 2026-07-20): STATIC access tags only — lookups.dat 1.7.10
    // carries no *:conditional data, so seasonal closures can't be detected.
    const footSport = sport === "hike" || sport === "run";
    const alertFor = (tags: Record<string, string>): string | null => {
      if (tags.access === "no" || tags.access === "private") {
        return `access_${tags.access}`;
      }
      if (!footSport && tags.bicycle === "no") return "bicycle_no";
      if (footSport && tags.foot === "no") return "foot_no";
      return null;
    };
    // Nearest geometry index for a message coordinate (microdegrees).
    const idxNear = (lonU: number, latU: number): number => {
      const lon = lonU / 1e6;
      const lat = latU / 1e6;
      let best = 0;
      let bestD = Infinity;
      for (let i = 0; i < coords.length; i++) {
        const dx = coords[i][0] - lon;
        const dy = coords[i][1] - lat;
        const d = dx * dx + dy * dy;
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      return best;
    };

    // messages: [header, ...rows] — per-way-stretch WayTags. Each row's
    // Longitude/Latitude is the END of its stretch; the stretch starts at
    // the previous row's end (route start for the first row).
    const messages: string[][] = props.messages ?? [];
    const surfacesKm: Record<string, number> = {};
    const waytypesKm: Record<string, number> = {};
    const buckets = { paved: 0, unpaved: 0, unknown: 0 };
    type Alert = { kind: string; fromIdx: number; toIdx: number; distanceM: number };
    const alerts: Alert[] = [];
    let prevIdx = 0;
    for (const row of messages.slice(1)) {
      const distance = parseInt(row[3] ?? "0", 10);
      const tags: Record<string, string> = {};
      for (const kv of (row[9] ?? "").split(" ")) {
        const i = kv.indexOf("=");
        if (i > 0) tags[kv.slice(0, i)] = kv.slice(i + 1);
      }
      const surface = tags.surface;
      const highway = tags.highway ?? "unknown";
      surfacesKm[surface ?? "unknown"] =
        (surfacesKm[surface ?? "unknown"] ?? 0) + distance;
      waytypesKm[highway] = (waytypesKm[highway] ?? 0) + distance;
      buckets[surfaceBucket(surface)] += distance;

      const endIdx = idxNear(parseInt(row[0] ?? "0", 10), parseInt(row[1] ?? "0", 10));
      const kind = alertFor(tags);
      if (kind && endIdx > prevIdx) {
        const last = alerts[alerts.length - 1];
        if (last && last.kind === kind && last.toIdx === prevIdx) {
          // consecutive stretches of the same restriction — merge
          last.toIdx = endIdx;
          last.distanceM += distance;
        } else {
          alerts.push({ kind, fromIdx: prevIdx, toIdx: endIdx, distanceM: distance });
        }
      }
      prevIdx = Math.max(prevIdx, endIdx);
    }

    return NextResponse.json({
      geometry: {
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates: coords },
      },
      stats: {
        distanceM: parseInt(props["track-length"], 10),
        timeS: parseInt(props["total-time"], 10),
        ascendM: parseInt(props["filtered ascend"], 10),
        descendM: Math.abs(parseInt(props["plain-ascend"], 10) - parseInt(props["filtered ascend"], 10)),
      },
      surfaces: { buckets, detailM: surfacesKm },
      waytypes: waytypesKm,
      elevation,
      alerts,
    });
  } catch {
    return NextResponse.json(
      { error: "router_unavailable" },
      { status: 503 },
    );
  }
}
