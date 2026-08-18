import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getWeather } from "@/lib/weather";
import TourView from "@/components/TourView";
import { buildAutoDesc } from "@/lib/autoDesc";
import { getSiteSettings, pageTitle } from "@/lib/siteSettings";
import { SITE_URL } from "@/app/sitemap";
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
  country: string | null;
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
  "id,osm_id,name,sport,region,country,operator,network,roundtrip,geometry,elevation,stats,surfaces,waytypes,source_url,is_gravel,gravel_m";

// OSM-standaard netwerkcodes → vertaalsleutel. Named networks (met spatie)
// tonen we letterlijk; onbekende korte codes (bv. "lcn-old") slaan we over
// i.p.v. cryptische ruis te tonen.
const NETWORK_CODES = ["iwn", "nwn", "rwn", "lwn", "icn", "ncn", "rcn", "lcn", "mtb"];

async function getTrail(id: string): Promise<Trail | null> {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/trails?id=eq.${encodeURIComponent(id)}&select=${SELECT}`,
    {
      headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! },
      next: { revalidate: 86400, tags: ["trails"] },
    },
  );
  // Onderscheid 4xx (permanent) van 5xx/network (transiënt) — beide zijn "niet
  // ok" maar vragen om tegengesteld gedrag:
  //  • 4xx: de request kán niet slagen. Vooral 400 op een niet-uuid `id` (een
  //    oude/kapotte of door een crawler verzonnen URL zoals /trail/foo) — Postgres
  //    kan "foo" niet naar uuid casten. Dat is géén trail → notFound() geeft een
  //    cachebare 404, precies wat een crawler moet zien. Vóór deze split gooide
  //    het hier → de error-boundary → 500, en Google retryt 5xx eindeloos op een
  //    URL die nooit gaat bestaan.
  //  • 5xx/network: transiënte Supabase-blip. Throwen zodat Next de render níét
  //    cachet (revalidate=86400 zou een geldige trail anders een hele dag op 404
  //    vastzetten) en de volgende request opnieuw probeert. Network-errors
  //    (fetch reject) propageren vanzelf als throw — ook transiënt, juist zo.
  if (!res.ok) {
    if (res.status >= 400 && res.status < 500) return null;
    throw new Error(`trails REST ${res.status} for id ${id}`);
  }
  const rows = (await res.json()) as Trail[];
  // fetch ok + geen rij = de trail bestaat écht niet → notFound (juist, cachebaar).
  return rows[0] ?? null;
}

type RelatedTrail = {
  id: string;
  name: string;
  sport: string;
  is_gravel: boolean;
  stats: { distanceM: number; ascendM: number };
  geometry: GeoJSON.LineString | null;
};

// Andere officiële routes in dezelfde regio (+ land, om regionaam-botsingen als
// Limburg NL/BE te scheiden) — cross-navigatie op de 30k trail-pagina's.
// I.t.t. getTrail throwt dit NIET bij een blip: het related-blok is niet-
// kritisch, dus [] → gewoon geen blok, de trail zelf blijft renderen.
async function getRelatedTrails(
  region: string,
  country: string | null,
  excludeId: string,
  sport: string,
): Promise<RelatedTrail[]> {
  // Zelfde-regio-fetch stond op order=name → élke trail in een regio toonde
  // dezelfde 6 alfabetisch-eerste routes, sport-blind (een fietsroute in
  // Noord-Holland kreeg 6 wandelroutes). Nu: gegarandeerde zelfde-sport-fetch
  // eerst, any-sport als backfill zodat het (niet-kritische) blok nooit leger
  // wordt dan voorheen. Zelfde patroon als de tour-pagina.
  const base =
    `select=id,name,sport,is_gravel,stats,geometry&region=eq.${encodeURIComponent(region)}` +
    (country ? `&country=eq.${encodeURIComponent(country)}` : "") +
    `&id=neq.${excludeId}&order=name&limit=6`;
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/trails`;
  const opts = {
    headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! },
    next: { revalidate: 86400, tags: ["trails"] },
  };
  const [sameRes, anyRes] = await Promise.all([
    fetch(`${url}?${base}&sport=eq.${encodeURIComponent(sport)}`, opts),
    fetch(`${url}?${base}`, opts),
  ]);
  const same = sameRes.ok ? ((await sameRes.json()) as RelatedTrail[]) : [];
  const any = anyRes.ok ? ((await anyRes.json()) as RelatedTrail[]) : [];
  // Zelfde-sport vooraan (dedup op id); any-sport vult aan tot 6.
  const byId = new Map<string, RelatedTrail>();
  for (const tr of [...same, ...any]) if (!byId.has(tr.id)) byId.set(tr.id, tr);
  return Array.from(byId.values()).slice(0, 6);
}

export async function generateMetadata({
  params,
}: {
  params: { id: string; locale: string };
}): Promise<Metadata> {
  const trail = await getTrail(params.id);
  if (!trail)
    return {
      title: (await getTranslations({ locale: params.locale, namespace: "notFound" }))("title"),
    };
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
    // Self-canonical: consolideer eventuele tracking-param-varianten (?fbclid,
    // ?utm) naar de schone route-URL. hreflang blijft via next-intl's Link-header.
    alternates: { canonical: `/${params.locale}/trail/${params.id}` },
    openGraph: { title: ogTitle, description: metaDesc },
    // summary_large_image: de trail heeft een route-vorm-OG-afbeelding, dus een
    // grote preview i.p.v. een kleine thumbnail (consistent met tours).
    twitter: { card: "summary_large_image", title: ogTitle, description: metaDesc },
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
  const tNav = await getTranslations("nav");
  // Menselijk-leesbare moeilijkheid + ondergrond ("Zware route. … Grotendeels
  // verharde wegen."). Tours toonden dit al; trails niet — zelfde helper, zodat
  // beide detailpagina's consistent zijn.
  const autoDesc = buildAutoDesc(tt, trail);

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

  // Cross-navigatie: andere officiële routes in dezelfde regio.
  const tsport = await getTranslations("planner.sports");
  const relatedTrails = trail.region
    ? await getRelatedTrails(trail.region, trail.country, trail.id, trail.sport)
    : [];

  // Hoogtepunten die de route passeert (al opgehaald voor de kaart-pins) ook als
  // tekst-links: elk POI → zijn highlight-pagina, met de categorie als meta.
  const passedHl = highlightPins.features.map((f) => {
    const p = (f.properties ?? {}) as { id: string; name: string; category: string };
    return {
      href: `/${locale}/highlight/${p.id}`,
      name: p.name,
      meta: tHl(`cat.${p.category}` as never),
    };
  });

  // Eén bron voor de zichtbare breadcrumb (TourView) én de BreadcrumbList-JSON-LD,
  // zodat ze niet uit elkaar lopen. Regio-link draagt land mee tegen regionaam-
  // botsingen (Limburg NL vs BE).
  const crumbs = [
    { label: tNav("trails"), href: `/${locale}/trails` },
    ...(trail.region
      ? [
          {
            label: trail.region,
            href: trail.country
              ? `/${locale}/trails?country=${trail.country}&region=${encodeURIComponent(trail.region)}`
              : `/${locale}/trails?region=${encodeURIComponent(trail.region)}`,
          },
        ]
      : []),
  ];

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
      {/* BreadcrumbList voor Google rich results (matcht de zichtbare breadcrumb):
          Trails › regio › routenaam, met absolute URLs. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              ...crumbs.map((c, i) => ({
                "@type": "ListItem",
                position: i + 1,
                name: c.label,
                item: `${SITE_URL}${c.href}`,
              })),
              {
                "@type": "ListItem",
                position: crumbs.length + 1,
                name: trail.name,
                item: `${SITE_URL}/${locale}/trail/${params.id}`,
              },
            ],
          }),
        }}
      />
      <TourView
        geometry={trail.geometry}
        elevation={trail.elevation}
        waypoints={startWaypoint}
        autoDesc={autoDesc}
        highlightPins={highlightPins}
        breadcrumb={crumbs}
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
        related={
          relatedTrails.length > 0 || passedHl.length > 0
            ? {
                toursTitle: t("moreInRegion", { region: trail.region ?? "" }),
                // Maak de "Meer routes in <regio>"-kop een link naar de volledige,
                // filterbare /trails-lijst voor die regio (zichtbaarder dan de
                // breadcrumb-crumb). Alleen als er een regio is.
                ...(trail.region
                  ? {
                      toursHref: trail.country
                        ? `/${locale}/trails?country=${trail.country}&region=${encodeURIComponent(trail.region)}`
                        : `/${locale}/trails?region=${encodeURIComponent(trail.region)}`,
                    }
                  : {}),
                tours: relatedTrails.map((tr) => ({
                  href: `/${locale}/trail/${tr.id}`,
                  name: tr.name,
                  meta: `${(tr.stats.distanceM / 1000).toFixed(1)} km · ↗${tr.stats.ascendM} m · ${tsport(
                    (tr.is_gravel ? "gravel" : tr.sport) as never,
                  )}`,
                  coords: tr.geometry?.coordinates as
                    | [number, number][]
                    | undefined,
                })),
                highlightsTitle: t("highlightsOnRoute"),
                highlights: passedHl,
              }
            : undefined
        }
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
