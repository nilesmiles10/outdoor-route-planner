import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { supabaseServer } from "@/lib/supabase/server";
import { CATEGORY_EMOJI, HIGHLIGHT_CATEGORIES } from "@/lib/highlights";
import { slugify } from "@/lib/slug";
import SiteFooter from "@/components/SiteFooter";
import { getSiteSettings, pageTitle } from "@/lib/siteSettings";

// GEN-116 — programmatic SEO pages: "<Category-plural> in <Region>".
// Driven by the highlights corpus (680 POIs with a backfilled region).
// Thin-content gate: a page only exists with ≥ MIN_ITEMS entries.

export const revalidate = 3600;
const MIN_ITEMS = 8;

type Hl = {
  id: string;
  name: string;
  category: string;
  region: string;
  description: string | null;
};

// Region names are not unique across countries: Limburg (NL/BE), Luxembourg
// (BE/LU) and Jura (CH/FR) each exist twice, and merging them put Belgian
// monuments on the Dutch-Limburg page. Those get a country-suffixed slug
// ("limburg-nl"); unique regions keep the plain slug.
function regionSlugFor(region: string, country: string | null, ambiguous: boolean) {
  const base = slugify(region);
  return ambiguous && country ? `${base}-${country.toLowerCase()}` : base;
}

async function resolve(regionSlug: string, category: string) {
  if (!(HIGHLIGHT_CATEGORIES as readonly string[]).includes(category)) return null;
  const sb = supabaseServer();
  // highlight_regions is a grouped view (~1.2k rows). Reading distinct
  // regions off `highlights` itself silently hit PostgREST's 1000-row cap
  // once the OSM seed landed, so most regions 404'd.
  const { data: regs } = await sb
    .from("highlight_regions")
    .select("region,country,n")
    .eq("category", category)
    .gte("n", MIN_ITEMS)
    .limit(1000);
  const rows = (regs ?? []) as { region: string; country: string | null; n: number }[];

  const perName = new Map<string, number>();
  for (const r of rows) perName.set(r.region, (perName.get(r.region) ?? 0) + 1);
  const match = rows.find(
    (r) => regionSlugFor(r.region, r.country, (perName.get(r.region) ?? 1) > 1) === regionSlug,
  );
  if (!match) return null;

  let q = sb
    .from("highlights")
    .select("id,name,category,region,description")
    .eq("region", match.region)
    .eq("category", category);
  if ((perName.get(match.region) ?? 1) > 1) q = q.eq("country", match.country);
  const { data } = await q.order("name").limit(500);
  const items = (data as Hl[]) ?? [];
  if (items.length < MIN_ITEMS) return null;
  return { region: match.region, items };
}

export async function generateMetadata({
  params,
}: {
  params: { region: string; category: string; locale: string };
}): Promise<Metadata> {
  const resolved = await resolve(params.region, params.category);
  if (!resolved) return { title: "Not found" };
  const t = await getTranslations("regionPage");
  const cat = t(`catPlural.${params.category}` as never);
  return {
    title: pageTitle(await getSiteSettings(), `${cat} in ${resolved.region}`),
    description: t("metaDescription", {
      count: resolved.items.length,
      category: cat.toLowerCase(),
      region: resolved.region,
    }),
  };
}

export default async function RegionCategoryPage({
  params,
}: {
  params: { region: string; category: string; locale: string };
}) {
  const resolved = await resolve(params.region, params.category);
  if (!resolved) notFound();
  const { region, items } = resolved;
  const { locale, category } = params;
  const t = await getTranslations("regionPage");
  const cat = t(`catPlural.${category}` as never);

  return (
    <main className="mx-auto min-h-dvh max-w-3xl px-4 pb-16 pt-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "ItemList",
            name: `${cat} in ${region}`,
            numberOfItems: items.length,
            itemListElement: items.slice(0, 50).map((h, i) => ({
              "@type": "ListItem",
              position: i + 1,
              name: h.name,
              url: `/${locale}/highlight/${h.id}`,
            })),
          }),
        }}
      />
      <nav className="mt-2 text-xs text-neutral-400">
        <a href={`/${locale}/discover`} className="hover:underline">
          {t("breadcrumbDiscover")}
        </a>
        {" / "}
        <span>{region}</span>
        {" / "}
        <span className="text-neutral-600">{cat}</span>
      </nav>

      <h1 className="mt-3 text-2xl font-semibold text-neutral-900">
        {CATEGORY_EMOJI[category]} {cat} in {region}
      </h1>
      <p className="mt-1 text-sm text-neutral-500">
        {t("intro", { count: items.length, category: cat.toLowerCase(), region })}
      </p>

      <ul className="mt-6 grid gap-2 sm:grid-cols-2">
        {items.map((h) => (
          <li key={h.id}>
            <a
              href={`/${locale}/highlight/${h.id}`}
              className="block rounded-xl border border-neutral-100 bg-white p-3 shadow-sm transition hover:shadow-md"
            >
              <div className="truncate font-medium text-neutral-900">
                {CATEGORY_EMOJI[h.category]} {h.name}
              </div>
              {h.description && (
                <div className="mt-0.5 truncate text-xs text-neutral-500">
                  {h.description}
                </div>
              )}
            </a>
          </li>
        ))}
      </ul>

      <SiteFooter />
    </main>
  );
}
