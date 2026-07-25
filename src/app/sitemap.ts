import type { MetadataRoute } from "next";
import { supabaseServer } from "@/lib/supabase/server";
import { slugify } from "@/lib/slug";

// Dynamic sitemap over all public content (tours, highlights, collections),
// both locales. Canonical host comes from NEXT_PUBLIC_SITE_URL (tarnoo.com).
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ??
  "https://outdoor-route-planner-seven.vercel.app";

export const revalidate = 3600;

const LOCALES = ["nl", "en"];

// PostgREST caps a response at max-rows (1000 here) regardless of .limit(),
// so a plain .limit(5000) silently truncated the highlights to 1000 once the
// OSM seed grew the table to ~6.6k — both the per-highlight URLs and the
// region×category counts derived from them. Page explicitly instead.
const PAGE = 1000;
async function fetchAll<T>(
  query: (from: number, to: number) => PromiseLike<{ data: T[] | null }>,
  cap = 20_000,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < cap; from += PAGE) {
    const { data } = await query(from, from + PAGE - 1);
    if (!data?.length) break;
    out.push(...data);
    if (data.length < PAGE) break;
  }
  return out;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const sb = supabaseServer();
  // Trail-URL's zitten in gesegmenteerde sitemaps: /trails-sitemap/sitemap/<n>.xml
  const [tours, highlightRows, collections, pages] = await Promise.all([
    sb.from("tours").select("id,updated_at").eq("visibility", "public").eq("kind", "planned").limit(1000),
    fetchAll<{ id: string; region: string | null; category: string }>((from, to) =>
      sb
        .from("highlights")
        .select("id,region,category")
        .eq("kind", "point")
        .order("id")
        .range(from, to),
    ),
    sb
      .from("collections")
      .select("id,updated_at")
      .eq("visibility", "public")
      .limit(1000),
    sb
      .from("pages")
      .select("slug,updated_at")
      .eq("published", true)
      .eq("noindex", false)
      .limit(100),
  ]);

  // GEN-116: region × category pages that pass the thin-content gate (≥8).
  const comboCounts = new Map<string, number>();
  for (const h of highlightRows) {
    if (!h.region) continue;
    const k = `${slugify(h.region)}/${h.category}`;
    comboCounts.set(k, (comboCounts.get(k) ?? 0) + 1);
  }
  const combos = Array.from(comboCounts.entries())
    .filter(([, n]) => n >= 8)
    .map(([k]) => k);

  const entries: MetadataRoute.Sitemap = [];
  for (const locale of LOCALES) {
    entries.push(
      { url: `${SITE_URL}/${locale}`, changeFrequency: "weekly", priority: 1 },
      {
        url: `${SITE_URL}/${locale}/discover`,
        changeFrequency: "daily",
        priority: 0.9,
      },
      {
        url: `${SITE_URL}/${locale}/collections`,
        changeFrequency: "weekly",
        priority: 0.8,
      },
      {
        url: `${SITE_URL}/${locale}/trails`,
        changeFrequency: "weekly",
        priority: 0.9,
      },
    );
    for (const t of tours.data ?? []) {
      entries.push({
        url: `${SITE_URL}/${locale}/tour/${t.id}`,
        lastModified: t.updated_at,
        changeFrequency: "weekly",
        priority: 0.8,
      });
    }
    // Per-highlight URL's staan in /highlights-sitemap/sitemap/<n>.xml —
    // met tienduizenden highlights × 2 locales past dat niet in één
    // sitemap (Google's limiet is 50.000 URL's). De region×category-
    // combo's hierboven blijven hier: dat zijn er weinig.
    for (const c of collections.data ?? []) {
      entries.push({
        url: `${SITE_URL}/${locale}/collection/${c.id}`,
        lastModified: c.updated_at,
        changeFrequency: "weekly",
        priority: 0.7,
      });
    }
    for (const combo of combos) {
      entries.push({
        url: `${SITE_URL}/${locale}/discover/${combo}`,
        changeFrequency: "weekly",
        priority: 0.7,
      });
    }
    for (const pg of pages.data ?? []) {
      entries.push({
        url: `${SITE_URL}/${locale}/${pg.slug}`,
        lastModified: pg.updated_at,
        changeFrequency: "monthly",
        priority: 0.4,
      });
    }
  }
  return entries;
}
