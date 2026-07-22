import type { MetadataRoute } from "next";
import { supabaseServer } from "@/lib/supabase/server";
import { slugify } from "@/lib/slug";

// Dynamic sitemap over all public content (tours, highlights, collections),
// both locales. Until the brand domain exists we advertise the Vercel URL.
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ??
  "https://outdoor-route-planner-seven.vercel.app";

export const revalidate = 3600;

const LOCALES = ["nl", "en"];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const sb = supabaseServer();
  const [tours, highlights, collections, pages, trails] = await Promise.all([
    sb.from("tours").select("id,updated_at").eq("visibility", "public").eq("kind", "planned").limit(1000),
    sb
      .from("highlights")
      .select("id,region,category")
      .eq("kind", "point")
      .limit(5000),
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
    // GEN-145: officiële routes — de "MTB route X"-zoektermen.
    sb.from("trails").select("id,updated_at").limit(5000),
  ]);

  // GEN-116: region × category pages that pass the thin-content gate (≥8).
  const comboCounts = new Map<string, number>();
  for (const h of (highlights.data ?? []) as {
    region: string | null;
    category: string;
  }[]) {
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
    for (const h of highlights.data ?? []) {
      entries.push({
        url: `${SITE_URL}/${locale}/highlight/${h.id}`,
        changeFrequency: "weekly",
        priority: 0.6,
      });
    }
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
    for (const tr of trails.data ?? []) {
      entries.push({
        url: `${SITE_URL}/${locale}/trail/${tr.id}`,
        lastModified: tr.updated_at,
        changeFrequency: "monthly",
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
