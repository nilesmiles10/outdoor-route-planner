import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
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

// Public, session-free content. supabaseServer() calls cookies(), which opts
// the route out of caching entirely — the same thing that kept trail pages
// re-rendering on every crawler hit. Plain anon fetches keep it cacheable.
const REST = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1`;
const HEADERS = { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! };

async function rest<T>(path: string): Promise<T[]> {
  try {
    const res = await fetch(`${REST}/${path}`, {
      headers: HEADERS,
      next: { revalidate: 3600, tags: ["highlights"] },
    });
    if (!res.ok) return [];
    return (await res.json()) as T[];
  } catch {
    return [];
  }
}

async function resolve(regionSlug: string, category: string) {
  if (!(HIGHLIGHT_CATEGORIES as readonly string[]).includes(category)) return null;
  const rows = await rest<{ region: string; country: string | null; n: number }>(
    `highlight_regions?select=region,country,n&category=eq.${encodeURIComponent(category)}&n=gte.${MIN_ITEMS}&limit=1000`,
  );

  const perName = new Map<string, number>();
  for (const r of rows) perName.set(r.region, (perName.get(r.region) ?? 0) + 1);
  const match = rows.find(
    (r) => regionSlugFor(r.region, r.country, (perName.get(r.region) ?? 1) > 1) === regionSlug,
  );
  if (!match) return null;

  const ambiguous = (perName.get(match.region) ?? 1) > 1;
  const items = await rest<Hl>(
    `highlights?select=id,name,category,region,description` +
      `&region=eq.${encodeURIComponent(match.region)}&category=eq.${encodeURIComponent(category)}` +
      (ambiguous && match.country ? `&country=eq.${encodeURIComponent(match.country)}` : "") +
      `&order=name&limit=500`,
  );
  if (items.length < MIN_ITEMS) return null;
  const label = ambiguous && match.country ? `${match.region} (${match.country})` : match.region;
  return { region: match.region, label, items };
}

// Empty list: do not prerender hundreds of pages at build time, but declaring
// it makes the route ISR-eligible instead of plain SSR (x-vercel-cache: MISS).
export async function generateStaticParams() {
  return [];
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
    title: pageTitle(await getSiteSettings(), `${cat} in ${resolved.label}`),
    description: t("metaDescription", {
      count: resolved.items.length,
      category: cat.toLowerCase(),
      region: resolved.label,
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
  const { label, items } = resolved;
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
            name: `${cat} in ${label}`,
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
        <span>{label}</span>
        {" / "}
        <span className="text-neutral-600">{cat}</span>
      </nav>

      <h1 className="mt-3 text-2xl font-semibold text-neutral-900">
        {CATEGORY_EMOJI[category]} {cat} in {label}
      </h1>
      <p className="mt-1 text-sm text-neutral-500">
        {t("intro", { count: items.length, category: cat.toLowerCase(), region: label })}
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
