import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { supabaseServer } from "@/lib/supabase/server";
import TourView from "@/components/TourView";

type TourRow = {
  id: string;
  name: string;
  sport: string;
  waypoints: { name: string; lon: number; lat: number }[];
  geometry: GeoJSON.LineString;
  elevation: number[];
  stats: { distanceM: number; timeS: number; ascendM: number; descendM: number };
  surfaces: { buckets: { paved: number; unpaved: number; unknown: number } };
  updated_at: string;
};

async function getTour(id: string): Promise<TourRow | null> {
  // Anonymous server client: RLS only exposes visibility='public' rows.
  const sb = supabaseServer();
  const { data } = await sb
    .from("tours")
    .select(
      "id,name,sport,waypoints,geometry,elevation,stats,surfaces,updated_at",
    )
    .eq("id", id)
    .maybeSingle();
  return (data as TourRow) ?? null;
}

export async function generateMetadata({
  params,
}: {
  params: { id: string; locale: string };
}): Promise<Metadata> {
  const tour = await getTour(params.id);
  if (!tour) return { title: "Tour not found" };
  const km = (tour.stats.distanceM / 1000).toFixed(1);
  return {
    title: `${tour.name} | ${km} km ${tour.sport}`,
    description: `${km} km · ↗ ${tour.stats.ascendM} m — planned with Outdoor Route Planner`,
  };
}

export default async function TourPage({
  params,
}: {
  params: { id: string; locale: string };
}) {
  const tour = await getTour(params.id);
  if (!tour) notFound();
  const t = await getTranslations("tourPage");

  const km = (tour.stats.distanceM / 1000).toFixed(1);
  const h = Math.floor(tour.stats.timeS / 3600);
  const m = Math.round((tour.stats.timeS % 3600) / 60);

  return (
    <main className="relative h-dvh w-full">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Trip",
            name: tour.name,
            description: `${km} km ${tour.sport} route`,
            itinerary: tour.waypoints.map((w) => ({
              "@type": "Place",
              name: w.name,
              geo: { "@type": "GeoCoordinates", latitude: w.lat, longitude: w.lon },
            })),
          }),
        }}
      />
      <TourView
        geometry={tour.geometry}
        elevation={tour.elevation}
        waypoints={tour.waypoints}
        header={{
          name: tour.name,
          sport: tour.sport,
          km,
          time: `${h}:${String(m).padStart(2, "0")}`,
          ascend: tour.stats.ascendM,
          descend: tour.stats.descendM,
          buckets: tour.surfaces.buckets,
          planLabel: t("openInPlanner"),
          gpxLabel: t("downloadGpx"),
        }}
      />
    </main>
  );
}
