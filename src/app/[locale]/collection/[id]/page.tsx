import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { supabaseServer } from "@/lib/supabase/server";
import BookmarkButton from "@/components/BookmarkButton";
import ShareButton from "@/components/ShareButton";
import MiniMap from "@/components/MiniMap";
import { aggregateStats, gradientFor, SPORT_EMOJI } from "@/lib/collections";
import SiteFooter from "@/components/SiteFooter";
import { getSiteSettings } from "@/lib/siteSettings";

type TourLite = {
  id: string;
  name: string;
  sport: string;
  stats: { distanceM: number; ascendM: number };
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
  params: { id: string };
}): Promise<Metadata> {
  const c = await getCollection(params.id);
  if (!c) return { title: "Collection not found" };
  const tours = c.collection_items.map((i) => i.tours).filter(Boolean) as TourLite[];
  const agg = aggregateStats(tours.map((t) => t.stats));
  // Entity-specifieke OG: zonder deze erven gedeelde collectie-links de
  // generieke layout-OG ("Tarnoo" / tagline).
  const ogTitle = `${c.title} · ${tours.length} routes · ${(agg.distanceM / 1000).toFixed(0)} km`;
  const ogDesc =
    c.intro?.slice(0, 160) ||
    `A collection of ${tours.length} outdoor routes — planned with ${(await getSiteSettings()).site_name}.`;
  return {
    title: `${c.title} | ${tours.length} routes · ${(agg.distanceM / 1000).toFixed(0)} km`,
    description: ogDesc,
    openGraph: { title: ogTitle, description: ogDesc },
    twitter: { title: ogTitle, description: ogDesc },
  };
}

export default async function CollectionPage({
  params,
}: {
  params: { id: string; locale: string };
}) {
  const c = await getCollection(params.id);
  if (!c) notFound();
  const t = await getTranslations("collections");
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

      <div
        className={`relative mt-2 flex h-40 items-center justify-center rounded-2xl bg-gradient-to-br ${gradientFor(coverSport)}`}
      >
        <span className="text-6xl opacity-90 drop-shadow">
          {(coverSport && SPORT_EMOJI[coverSport]) || "🗺️"}
        </span>
        {c.visibility === "private" && (
          <span className="absolute right-3 top-3 rounded-full bg-black/30 px-2 py-0.5 text-xs font-medium text-white">
            🔒 {t("private")}
          </span>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">{c.title}</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {tours.length} {tours.length === 1 ? "route" : "routes"} ·{" "}
            {(agg.distanceM / 1000).toFixed(0)} km · ↗ {Math.round(agg.ascendM)} m
          </p>
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
                <a
                  href={`/${locale}/tour/${tr.id}`}
                  className="font-medium text-neutral-900 hover:text-emerald-800"
                >
                  <span className="mr-1 text-neutral-400">{i + 1}.</span>
                  {tr.name}
                </a>
                <div className="text-xs text-neutral-500">
                  {(tr.stats.distanceM / 1000).toFixed(1)} km · ↗ {tr.stats.ascendM} m ·{" "}
                  <span className="capitalize">
                    {SPORT_EMOJI[tr.sport] ?? ""} {tr.sport}
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
