import { NextRequest, NextResponse } from "next/server";
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

    // messages: [header, ...rows] — per-segment WayTags (GEN-106 data source)
    const messages: string[][] = props.messages ?? [];
    const surfacesKm: Record<string, number> = {};
    const waytypesKm: Record<string, number> = {};
    const buckets = { paved: 0, unpaved: 0, unknown: 0 };
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
    }

    // Per-point elevation from the 3rd coordinate (GEN-101/105 data source)
    const coords: [number, number, number?][] = feature.geometry.coordinates;
    const elevation = coords.map((c) => c[2] ?? 0);

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
    });
  } catch {
    return NextResponse.json(
      { error: "router_unavailable" },
      { status: 503 },
    );
  }
}
