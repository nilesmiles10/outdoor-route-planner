import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { supabaseServer } from "@/lib/supabase/server";
import { getWeather } from "@/lib/weather";
import { difficulty } from "@/lib/difficulty";
import { CATEGORY_EMOJI } from "@/lib/highlights";
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

function haversineKm(aLon: number, aLat: number, bLon: number, bLat: number) {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLon = ((bLon - aLon) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) *
      Math.cos((bLat * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

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

// Komoot-style auto description (GEN-132), templated from difficulty +
// surface aggregates.
function buildAutoDesc(
  t: Awaited<ReturnType<typeof getTranslations>>,
  tour: TourRow,
): string {
  const diff = difficulty(tour.sport, tour.stats.distanceM, tour.stats.ascendM);
  const b = tour.surfaces.buckets;
  const total = b.paved + b.unpaved + b.unknown;
  const surfKey =
    total === 0
      ? "mixed"
      : b.paved / total >= 0.7
        ? "paved"
        : b.unpaved / total >= 0.7
          ? "unpaved"
          : "mixed";
  return `${t(`autoDesc.${diff}` as never)} ${t(`autoDesc.${surfKey}` as never)}`;
}

export async function generateMetadata({
  params,
}: {
  params: { id: string; locale: string };
}): Promise<Metadata> {
  const tour = await getTour(params.id);
  if (!tour) return { title: "Tour not found" };
  const km = (tour.stats.distanceM / 1000).toFixed(1);
  const t = await getTranslations("tourPage");
  return {
    title: `${tour.name} | ${km} km ${tour.sport}`,
    description: `${km} km · ↗ ${tour.stats.ascendM} m — ${buildAutoDesc(t, tour)}`,
  };
}

export default async function TourPage({
  params,
}: {
  params: { id: string; locale: string };
}) {
  const tour = await getTour(params.id);
  if (!tour) notFound();
  const { locale } = params;
  const t = await getTranslations("tourPage");
  const tHl = await getTranslations("highlightPage");
  const ts = await getTranslations("planner.sports");

  const km = (tour.stats.distanceM / 1000).toFixed(1);
  const h = Math.floor(tour.stats.timeS / 3600);
  const m = Math.round((tour.stats.timeS % 3600) / 60);
  const start = tour.waypoints[0];

  const sb = supabaseServer();
  const [weather, toursQ, hlQ] = await Promise.all([
    start ? getWeather(start.lon, start.lat) : null,
    sb
      .from("tours")
      .select("id,name,sport,stats,waypoints")
      .eq("visibility", "public")
      .neq("id", tour.id)
      .limit(100),
    sb
      .from("highlights")
      .select("id,name,category,lon,lat")
      .eq("kind", "point")
      .limit(2000),
  ]);

  type TourLite = {
    id: string;
    name: string;
    sport: string;
    stats: { distanceM: number; ascendM: number };
    waypoints: { lon: number; lat: number }[];
  };
  const relatedTours = start
    ? (((toursQ.data as TourLite[]) ?? [])
        .map((tr) => ({
          ...tr,
          distKm: tr.waypoints[0]
            ? haversineKm(start.lon, start.lat, tr.waypoints[0].lon, tr.waypoints[0].lat)
            : Infinity,
        }))
        .filter((tr) => tr.distKm <= 40)
        .sort((a, b) => a.distKm - b.distKm)
        .slice(0, 4))
    : [];

  type Hl = { id: string; name: string; category: string; lon: number; lat: number };
  const relatedHls = start
    ? (((hlQ.data as Hl[]) ?? [])
        .map((hl) => ({
          ...hl,
          distKm: haversineKm(start.lon, start.lat, hl.lon, hl.lat),
        }))
        .sort((a, b) => a.distKm - b.distKm)
        .slice(0, 6))
    : [];

  const autoDesc = buildAutoDesc(t, tour);

  return (
    <main className="relative h-dvh w-full">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Trip",
            name: tour.name,
            description: `${km} km ${tour.sport} route — ${autoDesc}`,
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
        autoDesc={autoDesc}
        weather={
          weather
            ? {
                title: t("weather"),
                days: weather.days.map((d) => ({
                  ...d,
                  label: new Date(d.date).toLocaleDateString(locale, {
                    weekday: "short",
                  }),
                })),
                packTip: weather.packTip
                  ? tHl(`pack.${weather.packTip}` as never)
                  : null,
              }
            : null
        }
        related={{
          toursTitle: t("relatedTours"),
          tours: relatedTours.map((tr) => ({
            href: `/${locale}/tour/${tr.id}`,
            name: tr.name,
            meta: `${(tr.stats.distanceM / 1000).toFixed(1)} km · ↗ ${tr.stats.ascendM} m · ${ts(tr.sport as never)} · ${Math.round(tr.distKm)} km ${t("away")}`,
          })),
          highlightsTitle: t("relatedHighlights"),
          highlights: relatedHls.map((hl) => ({
            href: `/${locale}/highlight/${hl.id}`,
            name: `${CATEGORY_EMOJI[hl.category] ?? "📍"} ${hl.name}`,
            meta:
              hl.distKm < 1
                ? `${Math.round(hl.distKm * 1000)} m`
                : `${hl.distKm.toFixed(1)} km`,
          })),
        }}
      />
    </main>
  );
}
