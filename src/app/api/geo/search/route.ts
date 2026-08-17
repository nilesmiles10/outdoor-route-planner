import { NextRequest, NextResponse } from "next/server";
import { checkLimit, clientIp } from "@/lib/ratelimit";
import { GEO_SEARCH_BASE, geoHeaders } from "@/lib/geo";

export const dynamic = "force-dynamic";

// GET /api/geo/search?q=utre&lat=52.1&lon=5.1
// Proxies Photon and returns simplified suggestions for the planner fields.
export async function GET(req: NextRequest) {
  const rl = await checkLimit("geo-search", clientIp(req), 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterS) } },
    );
  }
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q || q.length < 2) return NextResponse.json({ results: [] });

  const url = new URL(GEO_SEARCH_BASE);
  url.searchParams.set("q", q);
  url.searchParams.set("limit", "6");
  // Bias results toward the map viewport when provided.
  const lat = req.nextUrl.searchParams.get("lat");
  const lon = req.nextUrl.searchParams.get("lon");
  if (lat && lon) {
    url.searchParams.set("lat", lat);
    url.searchParams.set("lon", lon);
  }

  try {
    const res = await fetch(url, { headers: geoHeaders(), cache: "no-store" });
    if (!res.ok) throw new Error(`photon ${res.status}`);
    const data = await res.json();

    const results = (data.features ?? []).map(
      (f: {
        geometry: { coordinates: [number, number] };
        properties: Record<string, string>;
      }) => {
        const p = f.properties;
        const name = p.name ?? p.street ?? p.city ?? p.countrycode ?? "";
        // Context-only label (stad indien anders dan de naam + landcode). De
        // naam NIET meenemen: beide UI's (SearchField + AppHeader) tonen de
        // naam al vet als titel met dit label als subtitel eronder, dus met
        // p.name erin las het als "Amsterdam · Amsterdam, NL" — naam dubbel.
        const label = [
          p.street && p.street !== name ? p.street : null,
          p.city && p.city !== name ? p.city : null,
          p.countrycode,
        ]
          .filter(Boolean)
          .join(", ");
        return {
          name,
          label,
          type: p.osm_value ?? "place",
          lon: f.geometry.coordinates[0],
          lat: f.geometry.coordinates[1],
        };
      },
    );
    return NextResponse.json({ results });
  } catch {
    return NextResponse.json(
      { results: [], error: "geocoder_unavailable" },
      { status: 503 },
    );
  }
}
