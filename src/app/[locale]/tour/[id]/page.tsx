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
  owner: string;
  name: string;
  sport: string;
  waypoints: { name: string; lon: number; lat: number }[];
  geometry: GeoJSON.LineString;
  elevation: number[];
  stats: { distanceM: number; timeS: number; ascendM: number; descendM: number };
  surfaces: { buckets: { paved: number; unpaved: number; unknown: number } };
  updated_at: string;
  // GEN-117 activity columns (null on planned tours)
  kind: "planned" | "completed";
  recorded_at: string | null;
  duration_s: number | null;
  moving_s: number | null;
  max_speed_kmh: number | null;
  time_offsets: number[] | null;
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
  // Session-aware server client: anonymous visitors only see public rows;
  // a logged-in owner also sees their own private rows (RLS).
  const sb = supabaseServer();
  const { data } = await sb
    .from("tours")
    .select(
      "id,owner,name,sport,waypoints,geometry,elevation,stats,surfaces,updated_at,kind,recorded_at,duration_s,moving_s,max_speed_kmh,time_offsets",
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
      .eq("kind", "planned")
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

  // GEN-117: highlights actually passed along the track (<= 250 m off-route),
  // annotated with their km position. Track is stride-sampled — at ~250 m
  // tolerance a 5-point stride loses nothing.
  const coords = tour.geometry.coordinates;
  const cumKm: number[] = [0];
  for (let i = 1; i < coords.length; i++) {
    cumKm.push(
      cumKm[i - 1] +
        haversineKm(coords[i - 1][0], coords[i - 1][1], coords[i][0], coords[i][1]),
    );
  }
  const passed = (((hlQ.data as Hl[]) ?? [])
    .map((hl) => {
      let best = Infinity;
      let bestKm = 0;
      for (let i = 0; i < coords.length; i += 5) {
        const d = haversineKm(hl.lon, hl.lat, coords[i][0], coords[i][1]);
        if (d < best) {
          best = d;
          bestKm = cumKm[i];
        }
      }
      return { ...hl, offKm: best, atKm: bestKm };
    })
    .filter((hl) => hl.offKm <= 0.25)
    .sort((a, b) => a.atKm - b.atKm)
    .slice(0, 8));

  const autoDesc = buildAutoDesc(t, tour);

  const isActivity = tour.kind === "completed" && !!tour.time_offsets;
  const avgKmh =
    isActivity && tour.moving_s
      ? (tour.stats.distanceM / 1000 / (tour.moving_s / 3600)).toFixed(1)
      : null;

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
        social={{ tourId: tour.id, tourOwner: tour.owner }}
        activity={
          isActivity
            ? {
                timeOffsets: tour.time_offsets!,
                recordedLabel: new Date(tour.recorded_at!).toLocaleDateString(
                  locale,
                  { weekday: "long", day: "numeric", month: "long", year: "numeric" },
                ),
                movingLabel: t("activity.moving"),
                elapsedLabel: t("activity.elapsed"),
                avgLabel: t("activity.avgSpeed"),
                maxLabel: t("activity.maxSpeed"),
                segmentLabel: t("activity.segment"),
                movingS: tour.moving_s ?? 0,
                durationS: tour.duration_s ?? 0,
                avgKmh: avgKmh ?? "0",
                maxKmh: tour.max_speed_kmh ?? 0,
              }
            : null
        }
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
          passedTitle: t("activity.onRoute"),
          passed: passed.map((hl) => ({
            href: `/${locale}/highlight/${hl.id}`,
            name: `${CATEGORY_EMOJI[hl.category] ?? "📍"} ${hl.name}`,
            meta: `km ${hl.atKm.toFixed(1)}`,
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
