import type { MetadataRoute } from "next";
import { supabaseServer } from "@/lib/supabase/server";
import { withRegionSlugs } from "@/lib/regionSlug";
import { pageCount, trailRegions } from "@/lib/seo/trailRegions";

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
  // Trail-regio-landingspagina's (n >= 8). Weinig URL's (443 × 2 locales), dus
  // hier en niet in een eigen segment — net als de region×category-combo's.
  // .catch([]) zodat een 402 (Supabase over egress-quota) de hele
  // sitemap.xml niet laat crashen — dan tijdelijk zonder regio-URL's.
  const trailRegionList = await trailRegions().catch(() => []);
  // Trail-URL's zitten in gesegmenteerde sitemaps: /trails-sitemap/sitemap/<n>.xml
  const [tours, regionRows, collections, pages] = await Promise.all([
    sb.from("tours").select("id,updated_at").eq("visibility", "public").eq("kind", "planned").limit(1000),
    // Grouped view (~1.2k rows). Counting combos off `highlights` itself
    // meant paginating 500k rows — 500 requests — for a few hundred URLs.
    fetchAll<{ region: string; country: string | null; category: string; n: number }>(
      (from, to) =>
        sb
          .from("highlight_regions")
          .select("region,country,category,n")
          .gte("n", 8)
          .order("region")
          .range(from, to),
    ),
    sb
      // collection_items(tours(id)) meenemen om lege collecties te herkennen:
      // RLS geeft alleen publieke leden-tours terug, dus een collectie met 0
      // zichtbare routes is noindex (page.tsx) en hoort niet in de sitemap.
      .from("collections")
      .select("id,updated_at,collection_items(tours(id))")
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
  // Slugs must match resolve() in the region page: a region name shared by
  // two countries (Limburg NL/BE, Luxembourg BE/LU, Jura CH/FR) is
  // disambiguated with a country suffix, per category.
  const combos = withRegionSlugs(regionRows).map((r) => `${r.slug}/${r.category}`);

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
      // SEO-landingspagina's (use-case intent, geen kannibalisatie met de
      // planner-homepage). Statische React-routes, dus hier handmatig i.p.v.
      // uit een tabel.
      {
        url: `${SITE_URL}/${locale}/hiking-route-planner`,
        changeFrequency: "monthly",
        priority: 0.8,
      },
      {
        url: `${SITE_URL}/${locale}/cycling-route-planner`,
        changeFrequency: "monthly",
        priority: 0.8,
      },
      {
        url: `${SITE_URL}/${locale}/mtb-route-planner`,
        changeFrequency: "monthly",
        priority: 0.8,
      },
      {
        url: `${SITE_URL}/${locale}/running-route-planner`,
        changeFrequency: "monthly",
        priority: 0.8,
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
    // Highlight-pagina's zitten bewust NIET in deze hoofd-sitemap: het gros is
    // dun (OSM-seed) en noindex. Content-rijke highlights (≥1 tip/foto) worden
    // wél geïndexeerd en staan in de aparte gesegmenteerde /highlights-sitemap/
    // (mirror van trails-sitemap; opgesomd in robots.ts). Zo blijft dit bestand
    // klein en bevat het geen noindex-URL's. De region×category-combo's
    // hierboven blijven hier: dat zijn er weinig.
    for (const c of collections.data ?? []) {
      // Lege collecties (0 zichtbare routes) zijn noindex → overslaan, anders
      // adverteert de sitemap een noindex-pagina (tegenstrijdig signaal).
      const ci = (c as { collection_items?: { tours: unknown | null }[] })
        .collection_items;
      if (!ci?.some((i) => i.tours != null)) continue;
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
    for (const tr of trailRegionList) {
      // Ook de vervolgpagina's: 19 regio's zijn groter dan één pagina, en de
      // routes daarop zouden anders alleen via de pager-link vindbaar zijn.
      for (let page = 1; page <= pageCount(tr.n); page++) {
        entries.push({
          url:
            page === 1
              ? `${SITE_URL}/${locale}/trails/${tr.slug}`
              : `${SITE_URL}/${locale}/trails/${tr.slug}?page=${page}`,
          changeFrequency: "weekly",
          priority: page === 1 ? 0.7 : 0.5,
        });
      }
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
