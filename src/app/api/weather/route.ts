import { NextRequest, NextResponse } from "next/server";
import { getWeather } from "@/lib/weather";

// Client-side weer voor de planner: `getWeather` is server-only (ISR-fetch naar
// Open-Meteo), maar de planner is een client-component en kent de startcoördinaat
// pas ná het routeren. Deze route wrapt getWeather zodat de planner het weer bij
// het startpunt kan tonen — net als de tour/trail-detailpagina's al doen.
// Buiten de [locale]-boom (middleware sluit /api uit), dus geen locale-prefix.
export const revalidate = 3600;

export async function GET(req: NextRequest) {
  const lon = Number(req.nextUrl.searchParams.get("lon"));
  const lat = Number(req.nextUrl.searchParams.get("lat"));
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
    return NextResponse.json({ error: "bad_coords" }, { status: 400 });
  }
  const weather = await getWeather(lon, lat);
  return NextResponse.json(weather);
}
