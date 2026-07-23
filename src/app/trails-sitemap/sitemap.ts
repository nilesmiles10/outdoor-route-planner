import type { MetadataRoute } from "next";
import { SITE_URL } from "../sitemap";

// GEN-145 Europa: trail-URL's in gesegmenteerde sitemaps (5.000 per
// segment × 2 locales). generateSitemaps draait op build-time →
// plain PostgREST-fetch (supabaseServer gebruikt cookies() en mag hier
// niet; zelfde patroon als lib/siteSettings).

const PER_SEGMENT = 5000;
export const revalidate = 3600;

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const HEADERS = { apikey: KEY, Authorization: `Bearer ${KEY}` };

export async function generateSitemaps(): Promise<{ id: number }[]> {
  try {
    const res = await fetch(`${BASE}/rest/v1/trails?select=id&limit=1`, {
      headers: { ...HEADERS, Prefer: "count=exact" },
      next: { revalidate: 3600 },
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
  const rows = ((await res.json()) as { id: string; updated_at: string }[]) ?? [];
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
