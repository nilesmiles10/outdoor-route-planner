import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { supabaseServer } from "@/lib/supabase/server";
import { getWeather } from "@/lib/weather";
import TourView from "@/components/TourView";
import { getSiteSettings, pageTitle } from "@/lib/siteSettings";

// GEN-145 — detailpagina voor officiële routes (OSM-import). Hergebruikt
// TourView; auteursblok vervangen door bron-attributie (ODbL).

type Trail = {
  id: string;
  osm_id: number;
  name: string;
  sport: "hike" | "touring" | "mtb";
  region: string | null;
  operator: string | null;
  roundtrip: boolean;
  geometry: GeoJSON.LineString;
  elevation: number[];
  stats: { distanceM: number; timeS: number; ascendM: number; descendM: number };
  surfaces: { buckets: { paved: number; unpaved: number; unknown: number } };
  waytypes: Record<string, number>;
  source_url: string;
};

async function getTrail(id: string): Promise<Trail | null> {
  const sb = supabaseServer();
  const { data } = await sb
    .from("trails")
    .select(
      "id,osm_id,name,sport,region,operator,roundtrip,geometry,elevation,stats,surfaces,waytypes,source_url",
    )
    .eq("id", id)
    .maybeSingle();
  return (data as Trail) ?? null;
}

export async function generateMetadata({
  params,
}: {
  params: { id: string; locale: string };
}): Promise<Metadata> {
  const trail = await getTrail(params.id);
  if (!trail) return { title: "Trail not found" };
  const t = await getTranslations("trailPage");
  const km = (trail.stats.distanceM / 1000).toFixed(1);
  return {
    title: pageTitle(
      await getSiteSettings(),
      `${trail.name} | ${km} km ${t(`sportNoun.${trail.sport}` as never)}`,
    ),
    description: t("metaDescription", {
      name: trail.name,
      km,
      region: trail.region ?? "Nederland",
    }),
  };
}

export default async function TrailPage({
  params,
}: {
  params: { id: string; locale: string };
}) {
  const trail = await getTrail(params.id);
  if (!trail) notFound();
  const { locale } = params;
  const t = await getTranslations("trailPage");
  const tt = await getTranslations("tourPage");
  const tHl = await getTranslations("highlightPage");

  const km = (trail.stats.distanceM / 1000).toFixed(1);
  const h = Math.floor(trail.stats.timeS / 3600);
  const m = Math.round((trail.stats.timeS % 3600) / 60);
  const start = trail.geometry.coordinates[0];
  const weather = start ? await getWeather(start[0], start[1]) : null;

  const startWaypoint = start
    ? [{ name: t("start"), lon: start[0], lat: start[1] }]
    : [];

  return (
    <main className="relative h-dvh w-full">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Trip",
            name: trail.name,
            description: t("metaDescription", {
              name: trail.name,
              km,
              region: trail.region ?? "Nederland",
            }),
            sameAs: trail.source_url,
          }),
        }}
      />
      <TourView
        geometry={trail.geometry}
        elevation={trail.elevation}
        waypoints={startWaypoint}
        header={{
          name: trail.name,
          sport: trail.sport,
          km,
          time: `${h}:${String(m).padStart(2, "0")}`,
          ascend: trail.stats.ascendM,
          descend: trail.stats.descendM,
          buckets: trail.surfaces.buckets,
          planLabel: tt("openInPlanner"),
          gpxLabel: tt("downloadGpx"),
        }}
        durationS={trail.stats.timeS}
        turns={null}
        source={{
          badge: trail.roundtrip ? `${t("official")} · ${t("roundtrip")}` : t("official"),
          detail: trail.operator
            ? t("detailWithOperator", { operator: trail.operator })
            : t("detailNoOperator"),
          href: trail.source_url,
          linkText: t("viewOsm"),
        }}
        weather={
          weather
            ? {
                title: tt("weather"),
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
      />
    </main>
  );
}
