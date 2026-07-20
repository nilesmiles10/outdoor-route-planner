import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import EmbedView from "@/components/EmbedView";
import { SITE_URL } from "@/app/sitemap";
import { getSiteSettings } from "@/lib/siteSettings";

// GEN-135 — embeddable route widget. Plain anon client (no cookies): an
// iframe on a third-party site never has our session, so only public
// tours can ever render here — RLS enforces that server-side too.

export const revalidate = 3600;

type TourRow = {
  id: string;
  name: string;
  sport: string;
  geometry: GeoJSON.LineString;
  stats: { distanceM: number; timeS: number; ascendM: number };
};

export default async function EmbedPage({ params }: { params: { id: string } }) {
  const site = await getSiteSettings();
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const { data } = await sb
    .from("tours")
    .select("id,name,sport,geometry,stats")
    .eq("id", params.id)
    .eq("visibility", "public")
    .maybeSingle();
  const tour = data as TourRow | null;
  if (!tour) notFound();

  const km = (tour.stats.distanceM / 1000).toFixed(1);
  const h = Math.floor(tour.stats.timeS / 3600);
  const m = Math.round((tour.stats.timeS % 3600) / 60);

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <div className="min-h-0 flex-1">
        <EmbedView coordinates={tour.geometry.coordinates} />
      </div>
      <a
        href={`${SITE_URL}/nl/tour/${tour.id}`}
        target="_blank"
        rel="noopener"
        className="flex items-center justify-between gap-3 border-t border-neutral-200 bg-white px-3 py-2 hover:bg-neutral-50"
      >
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-neutral-900">
            {tour.name}
          </div>
          <div className="text-xs text-neutral-500">
            {km} km · {h}:{String(m).padStart(2, "0")} h · ↗ {tour.stats.ascendM} m ·{" "}
            <span className="capitalize">{tour.sport}</span>
          </div>
        </div>
        <span className="shrink-0 rounded-full bg-emerald-700 px-3 py-1 text-xs font-medium text-white">
          ⛰ {site.site_name} ↗
        </span>
      </a>
    </div>
  );
}
