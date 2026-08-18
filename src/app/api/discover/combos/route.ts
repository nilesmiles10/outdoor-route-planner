import { NextResponse } from "next/server";
import { discoverCombos } from "@/lib/seo/discoverCombos";

// Dunne wrapper. De logica (paginering, herkansing, slug-botsingen, Benelux-
// aanvulling) staat in lib/seo/discoverCombos.ts, zodat de server-wrapper van
// /discover dezelfde combo's kan voorladen zonder de query te dupliceren.
export const revalidate = 3600;

export async function GET() {
  const combos = await discoverCombos();
  // Lege uitkomst niet cachen: dat is een storing, geen geldige stand.
  return combos.length === 0
    ? NextResponse.json([], { headers: { "cache-control": "no-store" } })
    : NextResponse.json(combos);
}
