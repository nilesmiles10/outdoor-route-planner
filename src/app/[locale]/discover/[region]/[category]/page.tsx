import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { supabaseServer } from "@/lib/supabase/server";
import { CATEGORY_EMOJI, HIGHLIGHT_CATEGORIES } from "@/lib/highlights";
import { slugify } from "@/lib/slug";

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

async function resolve(regionSlug: string, category: string) {
  if (!(HIGHLIGHT_CATEGORIES as readonly string[]).includes(category)) return null;
  const sb = supabaseServer();
  const { data: regions } = await sb
    .from("highlights")
    .select("region")
    .not("region", "is", null)
    .limit(2000);
  const known = Array.from(
    new Set(((regions ?? []) as { region: string }[]).map((r) => r.region)),
  );
  const region = known.find((r) => slugify(r) === regionSlug);
  if (!region) return null;
  const { data } = await sb
    .from("highlights")
    .select("id,name,category,region,description")
    .eq("region", region)
    .eq("category", category)
    .order("name")
    .limit(500);
  const items = (data as Hl[]) ?? [];
  if (items.length < MIN_ITEMS) return null;
  return { region, items };
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
    title: `${cat} in ${resolved.region} | Outdoor Route Planner`,
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

      <footer className="mt-16 border-t border-neutral-100 pt-4 text-xs text-neutral-400">
        © {new Date().getFullYear()} Outdoor Route Planner ·{" "}
        <a href="https://www.openstreetmap.org/copyright" className="hover:underline">
          © OpenStreetMap contributors
        </a>
      </footer>
    </main>
  );
}
