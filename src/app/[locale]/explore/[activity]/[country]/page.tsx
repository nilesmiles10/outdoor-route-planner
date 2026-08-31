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
  MIN_TRAILS,
  comboCount,
  gatedCombos,
  regionsForCountryActivity,
  resolveActivity,
  resolveCountry,
  type Activity,
  type Country,
} from "@/lib/seo/activityCountries";

// Activity × country SEO landing page. Data-gated (>= MIN_TRAILS real routes;
// see activityCountries.ts). Distinct from /trails filter views: those
// self-canonical to /trails, so these pages are the indexable home for the
// "hiking routes in Austria" intent. Every claim is backed by real trail data —
// no fabricated routes or counts.

export const revalidate = 86400;
export const dynamicParams = true; // gated combos are pre-rendered; others fall to the runtime gate below

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

function name(c: Country | Activity, nl: boolean): string {
  return nl ? c.nl : c.en;
}

async function fetchTrails(activity: Activity, iso: string): Promise<TrailRow[]> {
  let q = supabasePublic()
    .from("trails")
    .select("id,name,sport,roundtrip,stats,is_gravel,gravel_m,thumb_coords")
    .eq("country", iso)
    .order("name_sort")
    .limit(CARD_LIMIT);
  q = activity.gravel ? q.eq("is_gravel", true) : q.eq("sport", activity.sport!);
  const { data } = await q;
  return (data as TrailRow[]) ?? [];
}

export async function generateStaticParams() {
  // Cost: pre-rendering all combos on every build burned build-CPU minutes.
  // Pre-render only the most popular (linked from /trails) for instant loads;
  // the rest render on-demand via ISR and cache (dynamicParams=true).
  const combos = await gatedCombos();
  return combos
    .sort((a, b) => b.count - a.count)
    .slice(0, 12)
    .map((c) => ({ activity: c.activity.key, country: c.country.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: { locale: string; activity: string; country: string };
}): Promise<Metadata> {
  const activity = resolveActivity(params.activity);
  const country = resolveCountry(params.country);
  if (!activity || !country) return {};
  const nl = params.locale === "nl";
  // "in" is the same word in en + nl — handy for "Hiking routes in Austria" /
  // "Wandelroutes in Oostenrijk".
  const title = `${name(activity, nl)} in ${name(country, nl)}`;
  const count = await comboCount(activity, country);
  const desc = nl
    ? `${count}+ ${name(activity, nl).toLowerCase()} in ${name(country, nl)}, uit OpenStreetMap. Bekijk afstand, hoogte en ondergrond, open in de planner en exporteer een GPX. Gratis, geen account.`
    : `${count}+ ${name(activity, nl).toLowerCase()} in ${name(country, nl)}, from OpenStreetMap. See distance, elevation and surface, open in the planner and export a GPX. Free, no account.`;
  return {
    title: pageTitle(await getSiteSettings(), title),
    description: desc,
    alternates: { canonical: `/${params.locale}/explore/${activity.key}/${country.slug}` },
    openGraph: {
      title,
      description: desc,
      url: `${SITE_URL}/${params.locale}/explore/${activity.key}/${country.slug}`,
      type: "website",
    },
  };
}

export default async function ActivityCountryPage({
  params,
}: {
  params: { locale: string; activity: string; country: string };
}) {
  const { locale } = params;
  const nl = locale === "nl";
  const activity = resolveActivity(params.activity);
  const country = resolveCountry(params.country);
  if (!activity || !country) notFound();

  // Runtime thin-content gate: a combo below the threshold gets no page
  // (covers direct hits on non-pre-rendered combos).
  const count = await comboCount(activity, country);
  if (count < MIN_TRAILS) notFound();

  const trails = await fetchTrails(activity, country.iso);
  const tp = await getTranslations({ locale, namespace: "planner" });
  const tt = await getTranslations({ locale, namespace: "trailsPage" });
  const combos = await gatedCombos();
  const regions = await regionsForCountryActivity(activity, country);
  const base = `${SITE_URL}/${locale}`;

  const actLabel = name(activity, nl);
  const cName = name(country, nl);
  const h1 = `${actLabel} in ${cName}`;
  const activityLower = actLabel.toLowerCase();

  // Internal-link mesh: other activities in this country + this activity in
  // other countries (only combos that actually have a page).
  const sameCountry = combos.filter(
    (c) => c.country.iso === country.iso && c.activity.key !== activity.key,
  );
  const sameActivity = combos
    .filter((c) => c.activity.key === activity.key && c.country.iso !== country.iso)
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: nl ? "Home" : "Home", item: base },
        { "@type": "ListItem", position: 2, name: tt("title"), item: `${base}/trails` },
        { "@type": "ListItem", position: 3, name: h1, item: `${base}/explore/${activity.key}/${country.slug}` },
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
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <nav className="text-xs text-neutral-400">
        <Link href={`/${locale}`} className="hover:underline">Home</Link>{" "}
        <span aria-hidden>/</span>{" "}
        <Link href={`/${locale}/trails`} className="hover:underline">{tt("title")}</Link>{" "}
        <span aria-hidden>/</span> <span className="text-neutral-500">{h1}</span>
      </nav>

      <h1 className="mt-3 text-2xl font-bold text-neutral-900">{h1}</h1>
      <p className="mt-2 max-w-2xl text-sm text-neutral-600">
        {nl
          ? `${count} bewegwijzerde ${activityLower} in ${cName}, geïmporteerd uit OpenStreetMap. Elke route toont afstand, hoogte en ondergrond — open 'm in de planner om aan te passen en als GPX te exporteren.`
          : `${count} waymarked ${activityLower} in ${cName}, imported from OpenStreetMap. Every route shows its distance, elevation and surface — open it in the planner to adjust it and export a GPX.`}
      </p>

      <div className="mt-4 flex flex-wrap gap-3">
        <Link
          href={`/${locale}?sport=${activity.plannerSport}`}
          className="inline-flex items-center rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
        >
          {nl ? "Plan een route" : "Plan a route"}
        </Link>
        <Link
          href={`/${locale}/trails?country=${country.iso}&sport=${activity.trailsSport}`}
          className="inline-flex items-center rounded-lg border border-emerald-700 px-4 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-50"
        >
          {nl ? "Filter alle routes" : "Filter all routes"}
        </Link>
      </div>

      {/* Route list — same card as /trails. */}
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
                  <span className="min-w-0 truncate text-sm font-medium text-neutral-900">
                    {tr.name}
                  </span>
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
      {count > trails.length && (
        <p className="mt-3 text-xs text-neutral-400">
          {nl
            ? `Nog ${count - trails.length} routes — bekijk alles via de filter hierboven.`
            : `${count - trails.length} more routes — see them all via the filter above.`}
        </p>
      )}

      {regions.length > 0 && (
        <>
          <h2 className="mt-10 text-lg font-semibold text-neutral-900">
            {nl ? `${actLabel} per regio` : `${actLabel} by region`}
          </h2>
          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {regions.map((r) => (
              <li key={r.slug}>
                <Link
                  href={`/${locale}/explore/${activity.key}/${country.slug}/${r.slug}`}
                  className="font-medium text-emerald-800 hover:underline"
                >
                  {r.region}
                  <span className="text-neutral-400"> ({r.count})</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      {sameCountry.length > 0 && (
        <>
          <h2 className="mt-10 text-lg font-semibold text-neutral-900">
            {nl ? `Andere activiteiten in ${cName}` : `Other activities in ${cName}`}
          </h2>
          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {sameCountry.map((c) => (
              <li key={c.activity.key}>
                <Link
                  href={`/${locale}/explore/${c.activity.key}/${country.slug}`}
                  className="font-medium text-emerald-800 hover:underline"
                >
                  {name(c.activity, nl)}
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      {sameActivity.length > 0 && (
        <>
          <h2 className="mt-8 text-lg font-semibold text-neutral-900">
            {nl ? `${actLabel} in andere landen` : `${actLabel} in other countries`}
          </h2>
          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {sameActivity.map((c) => (
              <li key={c.country.iso}>
                <Link
                  href={`/${locale}/explore/${activity.key}/${c.country.slug}`}
                  className="font-medium text-emerald-800 hover:underline"
                >
                  {name(c.country, nl)}
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="mt-8 text-sm text-neutral-600">
        {nl ? "Zelf een route tekenen? " : "Prefer to draw your own? "}
        <Link
          href={`/${locale}/${activity.key === "cycling" || activity.key === "gravel" ? "cycling-route-planner" : activity.key === "mtb" ? "mtb-route-planner" : "hiking-route-planner"}`}
          className="font-medium text-emerald-800 hover:underline"
        >
          {nl ? "Open de routeplanner" : "Open the route planner"}
        </Link>
        .
      </p>

      <p className="mt-8 text-[11px] text-neutral-400">{tt("attribution")}</p>
      <SiteFooter />
    </main>
  );
}
