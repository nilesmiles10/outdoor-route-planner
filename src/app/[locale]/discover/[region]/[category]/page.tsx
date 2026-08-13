import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { CATEGORY_EMOJI, HIGHLIGHT_CATEGORIES } from "@/lib/highlights";
import { withRegionSlugs, type RegionCombo } from "@/lib/regionSlug";
import SiteFooter from "@/components/SiteFooter";
import { getSiteSettings, pageTitle } from "@/lib/siteSettings";

// GEN-116 — programmatic SEO pages: "<Category-plural> in <Region>".
// Driven by the highlights corpus (680 POIs with a backfilled region).
// Thin-content gate: a page only exists with ≥ MIN_ITEMS entries.

export const revalidate = 3600;
const MIN_ITEMS = 8;
// Cap op de getoonde lijst; als 'ie geraakt wordt tonen we een eerlijke
// "X van Y"-hint i.p.v. stil de rest (Bayern/peak = 6.724) weg te laten.
const ITEM_LIMIT = 500;

type Hl = {
  id: string;
  name: string;
  category: string;
  region: string;
  description: string | null;
};

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
  // Pagineren, niet &limit=1000: dat is exact de PostgREST max-rows-cap, en de
  // grootste categorie (peak) zit al op 849 rijen — bij de volgende landen-
  // import zou hij er stil overheen gaan en zouden regio's gaan 404'en.
  const rows: RegionCombo[] = [];
  for (let offset = 0; offset < 20_000; offset += 1000) {
    const page = await rest<RegionCombo>(
      `highlight_regions?select=region,country,category,n&category=eq.${encodeURIComponent(category)}` +
        `&n=gte.${MIN_ITEMS}&order=region&limit=1000&offset=${offset}`,
    );
    rows.push(...page);
    if (page.length < 1000) break;
  }

  const match = withRegionSlugs(rows).find((r) => r.slug === regionSlug);
  if (!match) return null;

  const { ambiguous, label } = match;
  const items = await rest<Hl>(
    `highlights?select=id,name,category,region,description` +
      `&region=eq.${encodeURIComponent(match.region)}&category=eq.${encodeURIComponent(category)}` +
      (ambiguous && match.country ? `&country=eq.${encodeURIComponent(match.country)}` : "") +
      `&order=name&limit=${ITEM_LIMIT}`,
  );
  if (items.length < MIN_ITEMS) return null;
  return { region: match.region, label, items, total: match.n };
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
  const { label, items, total } = resolved;
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

      {items.length >= ITEM_LIMIT && total > items.length && (
        <p className="mt-4 rounded-lg bg-neutral-50 px-3 py-2 text-xs text-neutral-500">
          {t("capHint", { shown: items.length, total })}
        </p>
      )}

      <SiteFooter />
    </main>
  );
}
