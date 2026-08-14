import { supabaseServer } from "@/lib/supabase/server";
import { aggregateStats } from "@/lib/collections";
import { collectionOgCard, notFoundOgCard, OG_SIZE } from "@/lib/og/routeCard";

export const runtime = "nodejs";
export const size = OG_SIZE;
export const contentType = "image/png";

type Row = {
  title: string;
  collection_items: {
    tours: {
      stats: { distanceM: number; ascendM: number };
      geometry: { coordinates: [number, number][] } | null;
    } | null;
  }[];
};

// OG-share-kaart voor een collectie: overzicht van álle route-vormen + titel +
// stats. Collecties hadden geen preview-afbeelding bij delen/indexeren.
export default async function OgImage({ params }: { params: { id: string } }) {
  const sb = supabaseServer();
  const { data } = await sb
    .from("collections")
    .select("title,collection_items(tours(stats,geometry))")
    .eq("id", params.id)
    .maybeSingle();

  const c = data as unknown as Row | null;
  if (!c) return notFoundOgCard();

  const tours = c.collection_items.map((i) => i.tours).filter(Boolean) as NonNullable<
    Row["collection_items"][number]["tours"]
  >[];
  const routes = tours
    .map((t) => t.geometry?.coordinates)
    .filter((g): g is [number, number][] => !!g && g.length >= 2);
  const agg = aggregateStats(tours.map((t) => t.stats));

  return collectionOgCard({
    title: c.title,
    routes,
    distanceM: agg.distanceM,
    ascendM: Math.round(agg.ascendM),
    routesLabel: `${tours.length} ${tours.length === 1 ? "route" : "routes"}`,
  });
}
