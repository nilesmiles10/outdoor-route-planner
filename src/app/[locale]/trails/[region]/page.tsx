import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import SiteFooter from "@/components/SiteFooter";
import { entityMetadata } from "@/lib/seo/entityMetadata";
import { difficulty } from "@/lib/difficulty";
import { fmtDuration } from "@/lib/activity";
import { SITE_URL } from "@/app/sitemap";
import {
  resolveTrailRegion,
  TRAIL_LIST_LIMIT,
  type TrailListItem,
} from "@/lib/seo/trailRegions";

// Landingspagina "N officiële routes in <regio>" — de ontbrekende
// geografische ouder van de 30k trail-pagina's. Zie lib/seo/trailRegions.ts
// voor de drempel (n >= 8) en de onderbouwing daarvan.
//
// Bestond nog niet: de crosslinks die hierheen hóórden te wijzen
// (trail-breadcrumb, "routes in deze regio" op de regio×categorie-pagina)
// gingen naar /trails?region=…, en die query-URL canonicaliseert weg naar
// /trails. Er was dus geen indexeerbare regio-ouder.

export const revalidate = 3600;

function sportNounKey(t: TrailListItem): string {
  return t.is_gravel ? "gravel" : t.sport;
}

function pageParam(searchParams?: { page?: string }): number {
  const raw = searchParams?.page;
  return raw ? Number(raw) : 1;
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: { region: string; locale: string };
  searchParams?: { page?: string };
}): Promise<Metadata> {
  const page = pageParam(searchParams);
  const r = await resolveTrailRegion(params.region, page);
  if (!r)
    return {
      title: (
        await getTranslations({ locale: params.locale, namespace: "notFound" })
      )("title"),
    };
  const t = await getTranslations({
    locale: params.locale,
    namespace: "trailRegionPage",
  });
  // De ECHTE telling uit het aggregaat (r.n), niet de op TRAIL_LIST_LIMIT
  // gecapte lijst — anders claimt elke grote regio het cap-getal.
  // Paginatitel draagt het paginanummer, anders zijn pagina 2+ duplicaten van
  // pagina 1 in de SERP.
  const base = t("title", { count: r.n, region: r.label });
  const title =
    r.pages > 1
      ? `${base} — ${t("pageLabel", { page: r.page, pages: r.pages })}`
      : base;
  const desc = t("metaDescription", { count: r.n, region: r.label });
  // Canonical staat op de resolved slug (die kan een land-suffix dragen) én op
  // de PAGINA zelf, niet op pagina 1: consolideren naar pagina 1 zou de links op
  // 2+ devalueren, en precies daarvoor bestaat deze paginering.
  return entityMetadata({
    locale: params.locale,
    path:
      r.page > 1
        ? `trails/${params.region}?page=${r.page}`
        : `trails/${params.region}`,
    title,
    description: desc,
    ogImage: `/${params.locale}/opengraph-image`,
  });
}

export default async function TrailRegionPage({
  params,
  searchParams,
}: {
  params: { region: string; locale: string };
  searchParams?: { page?: string };
}) {
  setRequestLocale(params.locale);
  const r = await resolveTrailRegion(params.region, pageParam(searchParams));
  if (!r) notFound();
  const { locale } = params;
  const t = await getTranslations("trailRegionPage");
  const tt = await getTranslations("trailPage");
  const tNav = await getTranslations("nav");
  // difficulty() geeft een sleutel ("easy"/"moderate"/"hard"), geen label —
  // zonder deze vertaling stond er letterlijk "moderate" op een NL-pagina.
  const tp = await getTranslations("planner");
  const heading = t("title", { count: r.n, region: r.label });

  // Eén bron voor de zichtbare breadcrumb én de BreadcrumbList-JSON-LD.
  const crumbs = [
    { label: tNav("trails"), href: `/${locale}/trails` },
    { label: r.label, href: `/${locale}/trails/${params.region}` },
  ];

  return (
    <main className="mx-auto min-h-dvh max-w-5xl px-4 pb-16 pt-20">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: crumbs.map((c, i) => ({
              "@type": "ListItem",
              position: i + 1,
              name: c.label,
              item: `${SITE_URL}${c.href}`,
            })),
          }),
        }}
      />
      {/* ItemList over de daadwerkelijk getoonde routes — elk element verwijst
          naar een bestaande, indexeerbare trail-pagina. Geen verzonnen velden:
          alleen naam en URL, die allebei echt zijn. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "ItemList",
            name: heading,
            // Moet overeenkomen met wat er hieronder werkelijk staat: bij een
            // volle pagina (300 items) claimde dit er 300 en leverde er 100.
            numberOfItems: Math.min(r.items.length, 100),
            itemListElement: r.items.slice(0, 100).map((x, i) => ({
              "@type": "ListItem",
              position: i + 1,
              name: x.name,
              url: `${SITE_URL}/${locale}/trail/${x.id}`,
            })),
          }),
        }}
      />

      <nav aria-label="Breadcrumb" className="mb-3 text-sm text-neutral-500">
        {crumbs.map((c, i) => (
          <span key={c.href}>
            {i > 0 && <span className="mx-1.5">/</span>}
            {i === crumbs.length - 1 ? (
              <span className="text-neutral-700">{c.label}</span>
            ) : (
              <a href={c.href} className="hover:underline">
                {c.label}
              </a>
            )}
          </span>
        ))}
      </nav>

      <h1 className="text-2xl font-semibold text-neutral-900">{heading}</h1>
      <p className="mt-1.5 max-w-2xl text-sm text-neutral-600">
        {t("intro", { region: r.label })}
      </p>
      {r.pages > 1 && (
        <p className="mt-1 text-xs text-neutral-500">
          {t("capHintPaged", {
            from: (r.page - 1) * TRAIL_LIST_LIMIT + 1,
            to: (r.page - 1) * TRAIL_LIST_LIMIT + r.items.length,
            total: r.n,
          })}
        </p>
      )}

      <ul className="mt-6 flex flex-col divide-y divide-neutral-100">
        {r.items.map((x) => {
          const km = (x.stats.distanceM / 1000).toFixed(1);
          return (
            <li key={x.id}>
              <a
                href={`/${locale}/trail/${x.id}`}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2.5 hover:bg-neutral-50"
              >
                <span className="font-medium text-neutral-900">{x.name}</span>
                <span className="text-sm text-neutral-500">
                  {km} km · ↗ {x.stats.ascendM} m · {fmtDuration(x.stats.timeS)} ·{" "}
                  {tt(`sportNoun.${sportNounKey(x)}` as never)} ·{" "}
                  {tp(
                    `difficultyLabels.${difficulty(
                      x.sport,
                      x.stats.distanceM,
                      x.stats.ascendM,
                    )}` as never,
                  )}
                  {x.roundtrip && ` · ${t("roundtrip")}`}
                </span>
              </a>
            </li>
          );
        })}
      </ul>

      {/* Echte <a>-links, geen client-side pager: pagina 2+ moet crawlbaar zijn,
          anders blijven de routes erop even onbereikbaar als vóór de paginering. */}
      {r.pages > 1 && (
        <nav className="mt-6 flex items-center gap-4 text-sm" aria-label="Paginering">
          {r.page > 1 && (
            <a
              href={`/${locale}/trails/${params.region}${r.page - 1 > 1 ? `?page=${r.page - 1}` : ""}`}
              className="text-emerald-800 hover:underline"
            >
              ← {t("prev")}
            </a>
          )}
          <span className="text-neutral-500">
            {t("pageLabel", { page: r.page, pages: r.pages })}
          </span>
          {r.page < r.pages && (
            <a
              href={`/${locale}/trails/${params.region}?page=${r.page + 1}`}
              className="text-emerald-800 hover:underline"
            >
              {t("next")} →
            </a>
          )}
        </nav>
      )}

      <p className="mt-8 text-sm">
        <a href={`/${locale}/trails`} className="text-emerald-800 hover:underline">
          {t("allTrails")} →
        </a>
      </p>
      <p className="mt-6 text-xs text-neutral-500">{tt("detailNoOperator")}</p>

      <SiteFooter />
    </main>
  );
}

