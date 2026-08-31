import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { supabasePublic } from "@/lib/supabase/server";
import { difficulty } from "@/lib/difficulty";
import { fmtDuration } from "@/lib/activity";
import MiniMap from "@/components/MiniMap";
import SiteFooter from "@/components/SiteFooter";
import { getSiteSettings, pageTitle } from "@/lib/siteSettings";
import { SITE_URL } from "@/app/sitemap";
import {
  gatedRegionCombos,
  regionCombo,
  regionsForCountryActivity,
  resolveActivity,
  resolveCountry,
  type Activity,
} from "@/lib/seo/activityCountries";

// Activity × country × region SEO landing page (e.g. /en/explore/mtb/italy/dolomites).
// Data-gated (>= MIN_TRAILS real routes; see activityCountries.ts). Nested under
// the country page. Region names are raw OSM names (no localized form).

export const revalidate = 86400;
export const dynamicParams = true;

type TrailRow = {
  id: string;
  name: string;
  sport: "hike" | "touring" | "mtb";
  roundtrip: boolean;
  stats: { distanceM: number; timeS: number; ascendM: number };
  is_gravel: boolean;
  gravel_m: number;
  thumb_coords: [number, number][] | null;
};

const CARD_LIMIT = 60;

async function fetchTrails(activity: Activity, iso: string, region: string): Promise<TrailRow[]> {
  let q = supabasePublic()
    .from("trails")
    .select("id,name,sport,roundtrip,stats,is_gravel,gravel_m,thumb_coords")
    .eq("country", iso)
    .eq("region", region)
    .order("name_sort")
    .limit(CARD_LIMIT);
  q = activity.gravel ? q.eq("is_gravel", true) : q.eq("sport", activity.sport!);
  const { data } = await q;
  return (data as TrailRow[]) ?? [];
}

export async function generateStaticParams() {
  // Cost: ~295 region combos × 2 locales pre-rendered on every build was the
  // bulk of the build-CPU spend. Render them fully on-demand via ISR instead
  // (dynamicParams=true); still discoverable via the sitemap, cached after the
  // first hit. Regions are long-tail, so on-demand is the right trade.
  return [];
}

export async function generateMetadata({
  params,
}: {
  params: { locale: string; activity: string; country: string; region: string };
}): Promise<Metadata> {
  const activity = resolveActivity(params.activity);
  const country = resolveCountry(params.country);
  if (!activity || !country) return {};
  const combo = await regionCombo(activity, country, params.region);
  if (!combo) return {};
  const nl = params.locale === "nl";
  const actLabel = nl ? activity.nl : activity.en;
  const title = `${actLabel} in ${combo.region}`;
  const cName = nl ? country.nl : country.en;
  const desc = nl
    ? `${combo.count}+ ${actLabel.toLowerCase()} in ${combo.region} (${cName}), uit OpenStreetMap. Bekijk afstand, hoogte en ondergrond, open in de planner en exporteer een GPX.`
    : `${combo.count}+ ${actLabel.toLowerCase()} in ${combo.region} (${cName}), from OpenStreetMap. See distance, elevation and surface, open in the planner and export a GPX.`;
  return {
    title: pageTitle(await getSiteSettings(), title),
    description: desc,
    alternates: {
      canonical: `/${params.locale}/explore/${activity.key}/${country.slug}/${combo.slug}`,
    },
    openGraph: {
      title,
      description: desc,
      url: `${SITE_URL}/${params.locale}/explore/${activity.key}/${country.slug}/${combo.slug}`,
      type: "website",
    },
  };
}

export default async function ActivityRegionPage({
  params,
}: {
  params: { locale: string; activity: string; country: string; region: string };
}) {
  const { locale } = params;
  const nl = locale === "nl";
  const activity = resolveActivity(params.activity);
  const country = resolveCountry(params.country);
  if (!activity || !country) notFound();

  const combo = await regionCombo(activity, country, params.region);
  if (!combo) notFound(); // below the gate or unknown region

  const trails = await fetchTrails(activity, country.iso, combo.region);
  const tp = await getTranslations({ locale, namespace: "planner" });
  const tt = await getTranslations({ locale, namespace: "trailsPage" });
  const allRegionCombos = await gatedRegionCombos();
  const base = `${SITE_URL}/${locale}`;

  const actLabel = nl ? activity.nl : activity.en;
  const cName = nl ? country.nl : country.en;
  const h1 = `${actLabel} in ${combo.region}`;
  const activityLower = actLabel.toLowerCase();
  const countryPath = `/${locale}/explore/${activity.key}/${country.slug}`;

  const otherActivities = allRegionCombos.filter(
    (c) => c.country.iso === country.iso && c.slug === combo.slug && c.activity.key !== activity.key,
  );
  const otherRegions = (await regionsForCountryActivity(activity, country))
    .filter((c) => c.slug !== combo.slug)
    .slice(0, 8);

  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: base },
        { "@type": "ListItem", position: 2, name: tt("title"), item: `${base}/trails` },
        { "@type": "ListItem", position: 3, name: `${actLabel} in ${cName}`, item: `${base}/explore/${activity.key}/${country.slug}` },
        { "@type": "ListItem", position: 4, name: h1, item: `${base}/explore/${activity.key}/${country.slug}/${combo.slug}` },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: h1,
      numberOfItems: trails.length,
      itemListElement: trails.slice(0, 25).map((tr, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: tr.name,
        url: `${base}/trail/${tr.id}`,
      })),
    },
  ];

  return (
    <main className="mx-auto min-h-dvh max-w-4xl px-4 pb-16 pt-20">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <nav className="text-xs text-neutral-400">
        <Link href={`/${locale}`} className="hover:underline">Home</Link>{" "}
        <span aria-hidden>/</span>{" "}
        <Link href={`/${locale}/trails`} className="hover:underline">{tt("title")}</Link>{" "}
        <span aria-hidden>/</span>{" "}
        <Link href={countryPath} className="hover:underline">{cName}</Link>{" "}
        <span aria-hidden>/</span> <span className="text-neutral-500">{combo.region}</span>
      </nav>

      <h1 className="mt-3 text-2xl font-bold text-neutral-900">{h1}</h1>
      <p className="mt-2 max-w-2xl text-sm text-neutral-600">
        {nl
          ? `${combo.count} bewegwijzerde ${activityLower} in ${combo.region} (${cName}), uit OpenStreetMap. Open een route in de planner om aan te passen en als GPX te exporteren.`
          : `${combo.count} waymarked ${activityLower} in ${combo.region} (${cName}), from OpenStreetMap. Open a route in the planner to adjust it and export a GPX.`}
      </p>

      <div className="mt-4 flex flex-wrap gap-3">
        <Link
          href={`/${locale}?sport=${activity.plannerSport}`}
          className="inline-flex items-center rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
        >
          {nl ? "Plan een route" : "Plan a route"}
        </Link>
        <Link
          href={`/${locale}/trails?country=${country.iso}&region=${encodeURIComponent(combo.region)}&sport=${activity.trailsSport}`}
          className="inline-flex items-center rounded-lg border border-emerald-700 px-4 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-50"
        >
          {nl ? "Filter alle routes" : "Filter all routes"}
        </Link>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {trails.map((tr) => {
          const d = difficulty(tr.sport, tr.stats.distanceM, tr.stats.ascendM);
          return (
            <Link
              key={tr.id}
              href={`/${locale}/trail/${tr.id}`}
              className="min-w-0 overflow-hidden rounded-xl border border-neutral-100 bg-white shadow-sm transition hover:border-emerald-200 hover:shadow"
            >
              <div className="flex h-16 items-center justify-center border-b border-neutral-100 bg-neutral-50/60 p-1.5">
                <MiniMap coords={tr.thumb_coords ?? undefined} className="h-full w-full" />
              </div>
              <div className="px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-sm font-medium text-neutral-900">{tr.name}</span>
                  <span
                    className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                      d === "easy"
                        ? "bg-emerald-100 text-emerald-800"
                        : d === "moderate"
                          ? "bg-amber-100 text-amber-800"
                          : "bg-red-100 text-red-800"
                    }`}
                  >
                    {tp(`difficultyLabels.${d}` as never)}
                  </span>
                </div>
                <div className="mt-0.5 text-xs text-neutral-500">
                  {(tr.stats.distanceM / 1000).toFixed(1)} km · {fmtDuration(tr.stats.timeS)} h · ↗{" "}
                  {tr.stats.ascendM} m{tr.roundtrip ? " · 🔁" : ""}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
      {combo.count > trails.length && (
        <p className="mt-3 text-xs text-neutral-400">
          {nl
            ? `Nog ${combo.count - trails.length} routes — bekijk alles via de filter hierboven.`
            : `${combo.count - trails.length} more routes — see them all via the filter above.`}
        </p>
      )}

      {otherActivities.length > 0 && (
        <>
          <h2 className="mt-10 text-lg font-semibold text-neutral-900">
            {nl ? `Andere activiteiten in ${combo.region}` : `Other activities in ${combo.region}`}
          </h2>
          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {otherActivities.map((c) => (
              <li key={c.activity.key}>
                <Link
                  href={`/${locale}/explore/${c.activity.key}/${country.slug}/${c.slug}`}
                  className="font-medium text-emerald-800 hover:underline"
                >
                  {nl ? c.activity.nl : c.activity.en}
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      {otherRegions.length > 0 && (
        <>
          <h2 className="mt-8 text-lg font-semibold text-neutral-900">
            {nl ? `${actLabel} in andere regio's van ${cName}` : `${actLabel} in other ${cName} regions`}
          </h2>
          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {otherRegions.map((c) => (
              <li key={c.slug}>
                <Link
                  href={`/${locale}/explore/${activity.key}/${country.slug}/${c.slug}`}
                  className="font-medium text-emerald-800 hover:underline"
                >
                  {c.region}
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="mt-8 text-sm text-neutral-600">
        <Link href={countryPath} className="font-medium text-emerald-800 hover:underline">
          {nl ? `← Alle ${activityLower} in ${cName}` : `← All ${activityLower} in ${cName}`}
        </Link>
      </p>

      <p className="mt-8 text-[11px] text-neutral-400">{tt("attribution")}</p>
      <SiteFooter />
    </main>
  );
}
