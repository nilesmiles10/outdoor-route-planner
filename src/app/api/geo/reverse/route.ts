import { NextRequest, NextResponse } from "next/server";
import { checkLimit, clientIp } from "@/lib/ratelimit";
import { GEO_REVERSE_BASE, geoHeaders } from "@/lib/geo";

export const dynamic = "force-dynamic";

// GET /api/geo/reverse?lon=5.1&lat=52.1 — name for a dropped pin.
export async function GET(req: NextRequest) {
  const rl = await checkLimit("geo-reverse", clientIp(req), 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterS) } },
    );
  }
  const lon = req.nextUrl.searchParams.get("lon");
  const lat = req.nextUrl.searchParams.get("lat");
  if (!lon || !lat) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  try {
    const url = new URL(GEO_REVERSE_BASE);
    url.searchParams.set("lon", lon);
    url.searchParams.set("lat", lat);
    url.searchParams.set("limit", "1");
    const res = await fetch(url, { headers: geoHeaders(), cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    const p = data.features?.[0]?.properties;
    const name =
      p?.name ??
      (p?.street ? `${p.street}${p.housenumber ? ` ${p.housenumber}` : ""}` : null) ??
      p?.city ??
      null;
    return NextResponse.json({ name });
  } catch {
    return NextResponse.json({ name: null });
  }
}
