import type { MetadataRoute } from "next";
import { SITE_URL } from "../sitemap";

// Gesegmenteerde sitemap van ÁLLÉÉN content-rijke highlights (≥1 tip of foto,
// zie de content_rich_highlights-view). De ~500k dunne OSM-highlights blijven
// noindex én buiten elke sitemap — die massaal indexeren is een thin-content-
// risico voor het hele domein. Mirrort trails-sitemap; robots.ts somt de
// segmenten op (Next maakt geen sitemap-index).

const PER_SEGMENT = 1000; // = PostgREST max-rows
export const revalidate = 3600;

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const HEADERS = { apikey: KEY, Authorization: `Bearer ${KEY}` };

export async function generateSitemaps(): Promise<{ id: number }[]> {
  try {
    const res = await fetch(
      `${BASE}/rest/v1/content_rich_highlights?select=id&limit=1`,
      {
        headers: { ...HEADERS, Prefer: "count=exact" },
        // no-store: de telling komt uit de content-range HEADER, die Next's
        // Data Cache op een cache-hit niet bewaart → count 0 → segmenten missen.
        cache: "no-store",
      },
    );
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
    `${BASE}/rest/v1/content_rich_highlights?select=id,created_at&order=id&offset=${id * PER_SEGMENT}&limit=${PER_SEGMENT}`,
    { headers: HEADERS, next: { revalidate: 3600, tags: ["highlights"] } },
  );
  // Guard tegen een niet-OK respons (bv. 402 als Supabase over z'n
  // egress-quota zit): res.json() geeft dan een error-object, geen array,
  // en `for (const … of rows)` crasht met "r is not iterable" — wat op
  // 19-08-2026 de hele productie-build liet falen. Bij een fout: leeg
  // segment i.p.v. een crash; de sitemap is dan tijdelijk kleiner.
  const json = res.ok ? await res.json().catch(() => null) : null;
  const rows: { id: string; created_at: string }[] = Array.isArray(json) ? json : [];
  const entries: MetadataRoute.Sitemap = [];
  for (const locale of ["nl", "en"]) {
    for (const h of rows) {
      entries.push({
        url: `${SITE_URL}/${locale}/highlight/${h.id}`,
        lastModified: h.created_at,
        changeFrequency: "monthly",
        priority: 0.5,
      });
    }
  }
  return entries;
}
