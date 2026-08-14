import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getWeather } from "@/lib/weather";
import TourView from "@/components/TourView";
import { getSiteSettings, pageTitle } from "@/lib/siteSettings";
import { passedHighlightPins } from "@/lib/passedHighlights";

// GEN-145 — detailpagina voor officiële routes (OSM-import). Hergebruikt
// TourView; auteursblok vervangen door bron-attributie (ODbL).

export const revalidate = 86400;

// A dynamic-segment route is only eligible for on-demand ISR caching if it
// declares generateStaticParams; without it Next treats every request as
// plain SSR and Vercel reports x-vercel-cache: MISS forever. We do NOT want
// to prerender 30k trails x 2 locales at build time, so return nothing and
// let each URL be rendered once and then cached for `revalidate`.
export async function generateStaticParams() {
  return [];
}

type Trail = {
  id: string;
  osm_id: number;
  name: string;
  sport: "hike" | "touring" | "mtb";
  region: string | null;
  operator: string | null;
  // OSM-netwerkclassificatie: i/n/r/l + wn (wandel) of cn (fiets), of een
  // benoemd netwerk. Zegt wat vóór een officiële route: lokaal/regionaal/etc.
  network: string | null;
  roundtrip: boolean;
  geometry: GeoJSON.LineString;
  elevation: number[];
  stats: { distanceM: number; timeS: number; ascendM: number; descendM: number };
  surfaces: { buckets: { paved: number; unpaved: number; unknown: number } };
  waytypes: Record<string, number>;
  source_url: string;
  // Afgeleid in de DB (trail_is_gravel): touring-route met genoeg gravel-ish
  // ondergrond. De sport blijft 'touring' — dát is wat OSM zegt.
  is_gravel: boolean;
  gravel_m: number;
};

// Official trails are public, immutable-ish OSM content with no per-user
// variation. supabaseServer() calls cookies(), which opts the whole route out
// of caching: every one of ~30k trails x 2 locales then cost a fresh function
// invocation plus a query on each crawler hit, which is what pushed the
// Vercel account over its limit. A plain anon PostgREST fetch keeps the route
// static so Next can cache it (same pattern as lib/siteSettings + sitemaps).
const SELECT =
  "id,osm_id,name,sport,region,operator,network,roundtrip,geometry,elevation,stats,surfaces,waytypes,source_url,is_gravel,gravel_m";

// OSM-standaard netwerkcodes → vertaalsleutel. Named networks (met spatie)
// tonen we letterlijk; onbekende korte codes (bv. "lcn-old") slaan we over
// i.p.v. cryptische ruis te tonen.
const NETWORK_CODES = ["iwn", "nwn", "rwn", "lwn", "icn", "ncn", "rcn", "lcn", "mtb"];

async function getTrail(id: string): Promise<Trail | null> {
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/trails?id=eq.${encodeURIComponent(id)}&select=${SELECT}`,
      {
        headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! },
        next: { revalidate: 86400, tags: ["trails"] },
      },
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as Trail[];
    return rows[0] ?? null;
  } catch {
    return null;
  }
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
  const sportNoun = t(
    `sportNoun.${trail.is_gravel ? "gravel" : trail.sport}` as never,
  );
  const metaDesc = t("metaDescription", {
    name: trail.name,
    km,
    region: trail.region ?? "Nederland",
  });
  // Entity-specifieke OG i.p.v. de generieke layout-OG bij gedeelde links.
  const ogTitle = `${trail.name} · ${km} km ${sportNoun}`;
  return {
    title: pageTitle(
      await getSiteSettings(),
      // Gravel is de term waar mensen op zoeken; voor die routes wint hij van
      // het generieke "fietsroute" in de <title>.
      `${trail.name} | ${km} km ${sportNoun}`,
    ),
    description: metaDesc,
    openGraph: { title: ogTitle, description: metaDesc },
    twitter: { title: ogTitle, description: metaDesc },
  };
}

export default async function TrailPage({
  params,
}: {
  params: { id: string; locale: string };
}) {
  setRequestLocale(params.locale);
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

  // Netwerk-badge: gestandaardiseerde code → leesbaar label, benoemd netwerk
  // letterlijk (gecapt), onbekende korte codes weggelaten.
  const netCode = trail.network?.toLowerCase() ?? "";
  const networkBadge = NETWORK_CODES.includes(netCode)
    ? t(`networks.${netCode}` as never)
    : trail.network && /\s/.test(trail.network)
      ? trail.network.slice(0, 40)
      : null;

  // Highlights langs de route als kaart-pins (plain fetch → route blijft
  // statisch cachebaar, zie getTrail).
  const highlightPins = await passedHighlightPins(trail.geometry.coordinates);

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
        highlightPins={highlightPins}
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
        waytypes={trail.waytypes}
        source={{
          badge: [
            t("official"),
            networkBadge,
            trail.roundtrip ? t("roundtrip") : null,
            trail.is_gravel
              ? t("gravelBadge", { km: (trail.gravel_m / 1000).toFixed(1) })
              : null,
          ]
            .filter(Boolean)
            .join(" · "),
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
