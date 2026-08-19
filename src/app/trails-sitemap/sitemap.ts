import type { MetadataRoute } from "next";
import { SITE_URL } from "../sitemap";

// GEN-145 Europa: trail-URL's in gesegmenteerde sitemaps (5.000 per
// segment × 2 locales). generateSitemaps draait op build-time →
// plain PostgREST-fetch (supabaseServer gebruikt cookies() en mag hier
// niet; zelfde patroon als lib/siteSettings).

// 1000 = PostgREST's max-rows cap: een hogere limit levert stil 1.000 rijen
// (gevonden 2026-07-25: segmenten hadden 2.000 i.p.v. 10.000 URL's, dus
// 23k van de 30k trails stonden in géén enkele sitemap).
const PER_SEGMENT = 1000;
export const revalidate = 3600;

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const HEADERS = { apikey: KEY, Authorization: `Bearer ${KEY}` };

export async function generateSitemaps(): Promise<{ id: number }[]> {
  try {
    const res = await fetch(`${BASE}/rest/v1/trails?select=id&limit=1`, {
      headers: { ...HEADERS, Prefer: "count=exact" },
      // no-store: de telling komt uit de content-range HEADER, die Next's
      // Data Cache op een cache-hit niet bewaart → count 0 → 1 segment, dus
      // segmenten 1..N zouden 404'en. Vers lezen elke keer.
      cache: "no-store",
    });
    const range = res.headers.get("content-range") ?? "0-0/0";
    const count = parseInt(range.split("/")[1] ?? "0", 10) || 0;
    const segments = Math.max(1, Math.ceil(count / PER_SEGMENT));
    return Array.from({ length: segments }, (_, id) => ({ id }));
  } catch {
    return [{ id: 0 }];
  }
}

export default async function sitemap({
  id,
}: {
  id: number;
}): Promise<MetadataRoute.Sitemap> {
  const res = await fetch(
    `${BASE}/rest/v1/trails?select=id,updated_at&order=id&offset=${id * PER_SEGMENT}&limit=${PER_SEGMENT}`,
    { headers: HEADERS, next: { revalidate: 3600 } },
  );
  // Guard tegen een niet-OK respons (bv. 402 als Supabase over z'n
  // egress-quota zit): res.json() geeft dan een error-object, geen array,
  // en `for (const … of rows)` crasht met "r is not iterable" — wat op
  // 19-08-2026 de hele productie-build liet falen. Bij een fout: leeg
  // segment i.p.v. een crash; de sitemap is dan tijdelijk kleiner.
  const json = res.ok ? await res.json().catch(() => null) : null;
  const rows: { id: string; updated_at: string }[] = Array.isArray(json) ? json : [];
  const entries: MetadataRoute.Sitemap = [];
  for (const locale of ["nl", "en"]) {
    for (const t of rows) {
      entries.push({
        url: `${SITE_URL}/${locale}/trail/${t.id}`,
        lastModified: t.updated_at,
        changeFrequency: "monthly",
        priority: 0.7,
      });
    }
  }
  return entries;
}
