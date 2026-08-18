import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { supabaseServer } from "@/lib/supabase/server";
import { entityMetadata } from "@/lib/seo/entityMetadata";
import BookmarkButton from "@/components/BookmarkButton";
import ShareButton from "@/components/ShareButton";
import MiniMap from "@/components/MiniMap";
import {
  aggregateStats,
  gradientFor,
  multiMiniPaths,
  SPORT_EMOJI,
} from "@/lib/collections";
import { difficulty } from "@/lib/difficulty";
import { fmtDuration } from "@/lib/activity";
import SiteFooter from "@/components/SiteFooter";
import { getSiteSettings } from "@/lib/siteSettings";
import { SITE_URL } from "@/app/sitemap";

type TourLite = {
  id: string;
  name: string;
  sport: string;
  stats: { distanceM: number; ascendM: number; timeS: number };
  geometry: GeoJSON.LineString | null;
};
type Item = { position: number; note: string | null; tours: TourLite | null };
type Coll = {
  id: string;
  owner: string;
  title: string;
  intro: string | null;
  visibility: "private" | "close_friends" | "followers" | "public";
  updated_at: string;
  collection_items: Item[];
};

const SELECT =
  "id,owner,title,intro,visibility,updated_at,collection_items(position,note,tours(id,name,sport,stats,geometry))";

async function getCollection(id: string): Promise<Coll | null> {
  // Cookie-aware server client: RLS exposes public collections to anyone and
  // private ones only to their owner.
  const sb = supabaseServer();
  const { data } = await sb.from("collections").select(SELECT).eq("id", id).maybeSingle();
  // supabase-js types to-one embeds as arrays; the runtime shape is a single object.
  return (data as unknown as Coll) ?? null;
}

export async function generateMetadata({
  params,
}: {
  params: { id: string; locale: string };
}): Promise<Metadata> {
  const c = await getCollection(params.id);
  if (!c)
    return {
      title: (await getTranslations({ locale: params.locale, namespace: "notFound" }))("title"),
    };
  const tours = c.collection_items.map((i) => i.tours).filter(Boolean) as TourLite[];
  const agg = aggregateStats(tours.map((t) => t.stats));
  // Entity-specifieke OG: zonder deze erven gedeelde collectie-links de
  // generieke layout-OG ("Tarnoo" / tagline).
  // Lege collectie (alle leden privé/verwijderd) → geen "· 0 routes · 0 km"-
  // suffix in title/OG: dat leest als een kapotte pagina bij delen. Alleen de
  // naam. (De pagina is dan toch al noindex.)
  const km = (agg.distanceM / 1000).toFixed(0);
  const ogTitle =
    tours.length > 0 ? `${c.title} · ${tours.length} routes · ${km} km` : c.title;
  const ogDesc =
    c.intro?.slice(0, 160) ||
    `A collection of ${tours.length} outdoor routes — planned with ${(await getSiteSettings()).site_name}.`;
  // brand: false — net als tours droegen collectietitels nooit een merk-suffix.
  // summary_large_image: de collectie heeft een route-vorm-OG-afbeelding.
  // robots: een publieke collectie zonder zichtbare routes (alle leden privé)
  // is thin content — niet indexeren, zoals de gate op de regiopagina's. Voor
  // een anonieme crawler filtert RLS de privé-routes weg → tours.length 0; de
  // eigenaar ziet ze wél.
  return entityMetadata({
    locale: params.locale,
    path: `collection/${params.id}`,
    title:
      tours.length > 0
        ? `${c.title} | ${tours.length} routes · ${km} km`
        : c.title,
    brand: false,
    description: ogDesc,
    socialTitle: ogTitle,
    largeImage: true,
    ...(tours.length === 0 ? { robots: { index: false } } : {}),
  });
}

export default async function CollectionPage({
  params,
}: {
  params: { id: string; locale: string };
}) {
  const c = await getCollection(params.id);
  if (!c) notFound();
  const t = await getTranslations("collections");
  const tdiff = await getTranslations("planner.difficultyLabels");
  const tsport = await getTranslations("planner.sports");
  const tNav = await getTranslations("nav");
  const { locale } = params;

  const sb = supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  const isOwner = user?.id === c.owner;

  const items = [...c.collection_items].sort((a, b) => a.position - b.position);
  const tours = items.map((i) => i.tours).filter(Boolean) as TourLite[];
  const agg = aggregateStats(tours.map((t) => t.stats));
  const coverSport = tours[0]?.sport;
  // Overzicht van álle route-vormen in één genormaliseerd kader → de hero laat
  // de echte inhoud + geografische spreiding zien i.p.v. een generieke gradient.
  // Hergebruikt de al-opgehaalde geometrie; bemonsterd tot ~60 punten zodat de
  // hero-SVG klein blijft (op 480×100 is vol-resolutie niet zichtbaar).
  const sample = (
    c: [number, number][] | undefined,
  ): [number, number][] | undefined => {
    if (!c || c.length <= 60) return c;
    const step = (c.length - 1) / 59;
    return Array.from({ length: 60 }, (_, i) => c[Math.round(i * step)]);
  };
  const overviewPaths = multiMiniPaths(
    tours.map((t) => sample(t.geometry?.coordinates as [number, number][] | undefined)),
    480,
    100,
  );

  return (
    <main className="mx-auto min-h-dvh max-w-3xl px-4 pb-16 pt-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "ItemList",
            name: c.title,
            description: c.intro ?? undefined,
            numberOfItems: tours.length,
            itemListElement: tours.map((tr, i) => ({
              "@type": "ListItem",
              position: i + 1,
              name: tr.name,
              url: `/${locale}/tour/${tr.id}`,
            })),
          }),
        }}
      />
      {/* BreadcrumbList voor Google rich results (matcht de zichtbare breadcrumb):
          Collecties → collectienaam, met absolute URLs. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              {
                "@type": "ListItem",
                position: 1,
                name: tNav("collections"),
                item: `${SITE_URL}/${locale}/collections`,
              },
              {
                "@type": "ListItem",
                position: 2,
                name: c.title,
                item: `${SITE_URL}/${locale}/collection/${params.id}`,
              },
            ],
          }),
        }}
      />

      {/* Breadcrumb terug naar de collectie-lijst (community-collecties worden
          daar ontdekt) — navigatie + intern SEO-linkmesh, zoals trail/tour. */}
      <nav
        aria-label="Breadcrumb"
        className="mt-2 flex flex-wrap items-center gap-x-1 text-xs text-neutral-400"
      >
        <a href={`/${locale}/collections`} className="hover:underline">
          {tNav("collections")}
        </a>
        <span aria-hidden>/</span>
        <span className="text-neutral-600">{c.title}</span>
      </nav>

      <div
        className={`relative mt-2 flex h-40 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br ${gradientFor(coverSport)}`}
      >
        {overviewPaths.length > 0 ? (
          <svg
            viewBox="0 0 480 100"
            className="h-full w-full"
            preserveAspectRatio="xMidYMid meet"
            aria-hidden
          >
            {overviewPaths.map((d, i) => (
              <path
                key={i}
                d={d}
                fill="none"
                stroke="white"
                strokeOpacity={0.9}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ))}
          </svg>
        ) : (
          <span className="text-6xl opacity-90 drop-shadow">
            {(coverSport && SPORT_EMOJI[coverSport]) || "🗺️"}
          </span>
        )}
        {c.visibility === "private" && (
          <span className="absolute right-3 top-3 rounded-full bg-black/30 px-2 py-0.5 text-xs font-medium text-white">
            🔒 {t("private")}
          </span>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">{c.title}</h1>
          {/* Bij 0 zichtbare routes de statregel weglaten: "0 routes · 0 km · ↗
              0 m" onder een rijke intro is een trieste, overbodige regel — de
              lege-staat-boodschap (noRoutes) onderaan dekt het al. */}
          {tours.length > 0 && (
            <p className="mt-1 text-sm text-neutral-500">
              {tours.length} {tours.length === 1 ? "route" : "routes"} ·{" "}
              {(agg.distanceM / 1000).toFixed(0)} km
              {agg.timeS > 0 ? ` · ${fmtDuration(agg.timeS)} h` : ""} · ↗{" "}
              {Math.round(agg.ascendM)} m
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <ShareButton title={c.title} />
          <BookmarkButton collectionId={c.id} />
          {isOwner && (
            <a
              href={`/${locale}/collection/${c.id}/edit`}
              className="rounded-lg bg-neutral-100 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-200"
            >
              ✎ {t("edit")}
            </a>
          )}
        </div>
      </div>

      {c.intro && (
        <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-neutral-700">
          {c.intro}
        </p>
      )}

      <ol className="mt-6 flex flex-col gap-3">
        {items.map((item, i) => {
          const tr = item.tours;
          if (!tr) return null;
          return (
            <li
              key={tr.id}
              className="flex gap-3 rounded-xl border border-neutral-100 bg-white p-3 shadow-sm"
            >
              <div className="flex h-16 w-24 shrink-0 items-center justify-center rounded-lg bg-neutral-50">
                <MiniMap
                  coords={tr.geometry?.coordinates as [number, number][] | undefined}
                  className="h-full w-full"
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <a
                    href={`/${locale}/tour/${tr.id}`}
                    className="font-medium text-neutral-900 hover:text-emerald-800"
                  >
                    <span className="mr-1 text-neutral-400">{i + 1}.</span>
                    {tr.name}
                  </a>
                  {(() => {
                    const d = difficulty(
                      tr.sport,
                      tr.stats.distanceM,
                      tr.stats.ascendM,
                    );
                    return (
                      <span
                        className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          d === "easy"
                            ? "bg-emerald-100 text-emerald-800"
                            : d === "moderate"
                              ? "bg-amber-100 text-amber-800"
                              : "bg-red-100 text-red-800"
                        }`}
                      >
                        {tdiff(d)}
                      </span>
                    );
                  })()}
                </div>
                <div className="text-xs text-neutral-500">
                  {(tr.stats.distanceM / 1000).toFixed(1)} km ·{" "}
                  {fmtDuration(tr.stats.timeS)} h · ↗ {tr.stats.ascendM} m ·{" "}
                  <span>
                    {SPORT_EMOJI[tr.sport] ?? ""} {tsport(tr.sport as never)}
                  </span>
                </div>
                {item.note && (
                  <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-600">
                    {item.note}
                  </p>
                )}
              </div>
            </li>
          );
        })}
        {tours.length === 0 && (
          <p className="text-sm text-neutral-400">{t("noRoutes")}</p>
        )}
      </ol>

      <SiteFooter />
    </main>
  );
}
