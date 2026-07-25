import type { MetadataRoute } from "next";
import { SITE_URL } from "../sitemap";

// GEN-115 Europa: highlight-URL's in gesegmenteerde sitemaps, zelfde
// patroon als trails-sitemap. De OSM-seed tilt highlights van 680 naar
// tienduizenden; met 2 locales per highlight loopt één sitemap.xml tegen
// Google's harde limiet van 50.000 URL's aan.
//
// generateSitemaps draait op build-time → plain PostgREST-fetch
// (supabaseServer gebruikt cookies() en mag hier niet).

// 1000 = PostgREST's max-rows cap. Een hogere PER_SEGMENT levert stil
// 1.000 rijen per segment op en laat de rest uit élke sitemap vallen —
// exact de bug die 2026-07-25 in zowel trails-sitemap als sitemap.ts zat.
const PER_SEGMENT = 1000;
export const revalidate = 3600;

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const HEADERS = { apikey: KEY, Authorization: `Bearer ${KEY}` };

export async function generateSitemaps(): Promise<{ id: number }[]> {
  try {
    const res = await fetch(
      `${BASE}/rest/v1/highlights?select=id&kind=eq.point&limit=1`,
      {
        headers: { ...HEADERS, Prefer: "count=exact" },
        next: { revalidate: 3600 },
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
    `${BASE}/rest/v1/highlights?select=id&kind=eq.point&order=id&offset=${id * PER_SEGMENT}&limit=${PER_SEGMENT}`,
    { headers: HEADERS, next: { revalidate: 3600 } },
  );
  const rows = ((await res.json()) as { id: string }[]) ?? [];
  const entries: MetadataRoute.Sitemap = [];
  for (const locale of ["nl", "en"]) {
    for (const h of rows) {
      entries.push({
        url: `${SITE_URL}/${locale}/highlight/${h.id}`,
        changeFrequency: "weekly",
        priority: 0.6,
      });
    }
  }
  return entries;
}
