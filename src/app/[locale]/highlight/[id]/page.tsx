import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { supabaseServer } from "@/lib/supabase/server";
import { GEO_REVERSE_BASE, geoHeaders } from "@/lib/geo";
import { getWeather, wmoEmoji } from "@/lib/weather";
import { CATEGORY_EMOJI, CATEGORY_COLOR } from "@/lib/highlights";
import { gradientFor } from "@/lib/collections";
import { regionSlugFor } from "@/lib/regionSlug";
import HighlightMap from "@/components/HighlightMap";
import MiniMap from "@/components/MiniMap";
import HighlightActions from "@/components/HighlightActions";
import ShareButton from "@/components/ShareButton";
import Avatar from "@/components/Avatar";
import SiteFooter from "@/components/SiteFooter";
import { getSiteSettings, pageTitle } from "@/lib/siteSettings";
import { SITE_URL } from "@/app/sitemap";

// GEN-138 — highlight detail page. Anatomy copied from Komoot's highlight
// pages (torn down live 2026-07-20): photo grid, per-sport ratings, tips,
// nearby routes, weather + packing tip, nearby-places link mesh, planner CTA.

export const revalidate = 3600;

type Highlight = {
  id: string;
  name: string;
  category: string;
  lon: number;
  lat: number;
  description: string | null;
  description_nl: string | null;
  description_en: string | null;
  kind: string;
  geometry: GeoJSON.LineString | null;
  region: string | null;
  country: string | null;
};
type Vote = { value: number; sport: string | null };
type Tip = {
  id: string;
  sport: string | null;
  text: string;
  created_at: string;
  author: string | null;
  profile: { display_name: string | null; avatar_url: string | null } | null;
};
type Photo = { id: string; path: string };
type TourLite = {
  id: string;
  name: string;
  sport: string;
  stats: { distanceM: number; timeS: number; ascendM: number };
  waypoints: { lon: number; lat: number }[];
  geometry: GeoJSON.LineString | null;
};

// Kortste afstand (km) van een punt tot de route-geometrie, i.p.v. alleen tot
// het startpunt. Een highlight kan MIDDEN op een route liggen terwijl het
// startpunt ver weg is (loop/lineaire route) — met start-afstand werd zo'n
// route gemist én kreeg een on-route highlight een misleidend "X km
// hiervandaan" (Beau Site ligt óp de route maar toonde "15 km"). Sampling
// (≤~400 punten) houdt lange routes goedkoop; valt terug op het startpunt als
// er geen geometrie is.
function minDistKmToRoute(lon: number, lat: number, tr: TourLite): number {
  const coords = tr.geometry?.coordinates;
  if (coords && coords.length) {
    const step = Math.max(1, Math.floor(coords.length / 400));
    let best = Infinity;
    for (let i = 0; i < coords.length; i += step) {
      const d = haversineKm(lon, lat, coords[i][0], coords[i][1]);
      if (d < best) best = d;
    }
    return best;
  }
  return tr.waypoints[0]
    ? haversineKm(lon, lat, tr.waypoints[0].lon, tr.waypoints[0].lat)
    : Infinity;
}

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

// Downsample een route-lijn tot ~max punten voor een lichte MiniMap-thumbnail
// (i.p.v. de volledige geometry naar de client te dragen — ≤6 kaarten × 24 pt).
function thinCoords(
  coords: [number, number][] | undefined,
  max = 24,
): [number, number][] | undefined {
  if (!coords || coords.length <= max) return coords;
  const step = Math.ceil(coords.length / max);
  return coords.filter((_, i) => i % step === 0);
}

async function getHighlight(id: string): Promise<Highlight | null> {
  const sb = supabaseServer();
  const { data } = await sb
    .from("highlights")
    .select(
      "id,name,category,lon,lat,description,description_nl,description_en,kind,geometry,region,country",
    )
    .eq("id", id)
    .maybeSingle();
  return (data as Highlight) ?? null;
}

async function getPlace(lon: number, lat: number): Promise<string | null> {
  // Reverse-geocode the location line via our own Photon.
  try {
    const url = new URL(GEO_REVERSE_BASE);
    url.searchParams.set("lon", String(lon));
    url.searchParams.set("lat", String(lat));
    url.searchParams.set("limit", "1");
    const res = await fetch(url, { headers: geoHeaders(), next: { revalidate: 86400 } });
    const data = await res.json();
    const p = data.features?.[0]?.properties;
    if (!p) return null;
    return [p.city ?? p.name, p.state, p.country].filter(Boolean).join(", ");
  } catch {
    return null;
  }
}


export async function generateMetadata({
  params,
}: {
  params: { id: string; locale: string };
}): Promise<Metadata> {
  const hl = await getHighlight(params.id);
  if (!hl) return { title: "Highlight not found" };
  // Generated text wins over the raw OSM description tag; both may be null.
  const isEn = params.locale === "en";
  const blurb = (isEn ? hl.description_en : hl.description_nl) ?? hl.description;
  // Komoot's SEO-titelpatroon "<Naam> – <sport-routes>", gelokaliseerd: op EN-
  // pagina's stond hier het NL-suffix ("Wandel- & Fietsroutes") + NL-fallback.
  const titleSuffix = isEn ? "Hiking & Cycling routes" : "Wandel- & Fietsroutes";
  const hlDesc =
    blurb?.slice(0, 160) ??
    (isEn
      ? `Discover ${hl.name}: a community highlight with tips, photos and nearby routes.`
      : `Ontdek ${hl.name}: community-highlight met tips, foto's en routes in de buurt.`);
  return {
    title: pageTitle(await getSiteSettings(), `${hl.name} – ${titleSuffix}`),
    description: hlDesc,
    alternates: { canonical: `/${params.locale}/highlight/${params.id}` },
    // Entity-specifieke OG i.p.v. de generieke layout-OG bij gedeelde links.
    openGraph: { title: hl.name, description: hlDesc },
    twitter: { title: hl.name, description: hlDesc },
    // De OSM-seed maakt honderdduizenden highlight-pagina's terwijl tips en
    // foto's user-generated zijn en er nog geen gebruikers zijn — de meeste
    // pagina's zijn dus (nog) dun. Op die schaal kan Google het patroon als
    // thin content wegen en dat raakt het hele domein, niet alleen deze
    // URL's. Daarom voorlopig noindex; follow blijft aan zodat link-equity
    // naar routes en trails blijft lopen. Herzien zodra highlights echte
    // content hebben (tips/foto's) — dan per-pagina op rijkdom gaten.
    robots: { index: false, follow: true },
  };
}

export default async function HighlightPage({
  params,
}: {
  params: { id: string; locale: string };
}) {
  const hl = await getHighlight(params.id);
  if (!hl) notFound();
  const { locale } = params;
  const blurb =
    (locale === "en" ? hl.description_en : hl.description_nl) ?? hl.description;
  const t = await getTranslations("highlightPage");
  const ts = await getTranslations("planner.sports");
  const tr = await getTranslations("regionPage");

  const sb = supabaseServer();
  const [votesQ, tipsQ, photosQ, toursQ, nearbyQ, place, weather, regionQ, trailsQ] =
    await Promise.all([
      sb.from("highlight_votes").select("value,sport").eq("highlight_id", hl.id),
      sb
        .from("highlight_tips")
        .select(
          "id,sport,text,created_at,author,profile:profiles!highlight_tips_author_profiles_fkey(display_name,avatar_url)",
        )
        .eq("highlight_id", hl.id)
        .order("created_at", { ascending: false })
        .limit(20),
      sb
        .from("highlight_photos")
        .select("id,path")
        .eq("highlight_id", hl.id)
        .order("created_at", { ascending: false })
        .limit(9),
      sb
        .from("tours")
        .select("id,name,sport,stats,waypoints,geometry")
        .eq("visibility", "public")
        .eq("kind", "planned")
        .limit(100),
      // Bbox rond dit punt i.p.v. de hele tabel: `.limit(2000)` gaf door de
      // PostgREST max-rows-cap 1000 wíllekeurige (= oudste, dus NL/BE) punten
      // uit 500k, dus de linkmesh "in de buurt" was buiten NL/BE stil leeg.
      // ~0,15° ≈ 16 km; nabijheid wordt daarna in JS gesorteerd.
      sb
        .from("highlights")
        .select("id,name,category,lon,lat")
        .eq("kind", "point")
        .neq("id", hl.id)
        .gte("lon", hl.lon - 0.15)
        .lte("lon", hl.lon + 0.15)
        .gte("lat", hl.lat - 0.15)
        .lte("lat", hl.lat + 0.15)
        .limit(1000),
      getPlace(hl.lon, hl.lat),
      getWeather(hl.lon, hl.lat),
      // Bestaat de regio-categoriepagina voor dit punt? (≥8 van deze categorie
      // in deze regio — dezelfde thin-content-poort als de regiopagina zelf, dus
      // de breadcrumb-link kan nooit naar een 404 wijzen). Meerdere rijen = de
      // regionaam botst over landen → land-suffix in de slug (zelfde regel als
      // withRegionSlugs/resolve()).
      hl.region
        ? sb
            .from("highlight_regions")
            .select("country")
            .eq("region", hl.region)
            .eq("category", hl.category)
            .gte("n", 8)
        : Promise.resolve({ data: [] as { country: string | null }[] }),
      // Nabije officiële trails (start binnen een bbox rond dit punt) — vult de
      // vaak lege "routes in de buurt" (community-tours zijn schaars, ~24) met de
      // 4.4k-trails-dataset. Start-nabijheid via de generated start_lon/start_lat.
      sb
        .from("trails")
        .select("id,name,sport,stats,start_lon,start_lat,thumb_coords")
        .gte("start_lon", hl.lon - 0.25)
        .lte("start_lon", hl.lon + 0.25)
        .gte("start_lat", hl.lat - 0.25)
        .lte("start_lat", hl.lat + 0.25)
        .limit(60),
    ]);

  const votes = (votesQ.data as Vote[]) ?? [];
  const tips = (tipsQ.data as unknown as Tip[]) ?? [];
  const photos = (photosQ.data as Photo[]) ?? [];

  // Per-sport recommendation percentages (Komoot's signature block).
  const bySport = new Map<string, { pos: number; total: number }>();
  for (const v of votes) {
    const key = v.sport ?? "all";
    const e = bySport.get(key) ?? { pos: 0, total: 0 };
    e.total++;
    if (v.value > 0) e.pos++;
    bySport.set(key, e);
  }

  // Geometrie blijft server-side (alleen voor de afstandsmeting); we dragen 'm
  // niet mee in het resultaat dat naar de client gaat.
  const nearTours = (((toursQ.data as TourLite[]) ?? [])
    .map((tr) => ({
      id: tr.id,
      name: tr.name,
      sport: tr.sport,
      stats: tr.stats,
      distKm: minDistKmToRoute(hl.lon, hl.lat, tr),
      coords: thinCoords(tr.geometry?.coordinates as [number, number][] | undefined),
    }))
    .filter((tr) => tr.distKm <= 30)
    .sort((a, b) => a.distKm - b.distKm)
    .slice(0, 5));

  // Nabije officiële trails, aanvullend op de (schaarse) community-tours zodat
  // "routes in de buurt" ook op de 500k highlight-pagina's echt vult. Start-
  // nabijheid (start ≤20 km); samen met de tours gecapt op 6.
  type TrailLite = {
    id: string;
    name: string;
    sport: string;
    stats: { distanceM: number; ascendM: number };
    start_lon: number;
    start_lat: number;
    thumb_coords: [number, number][] | null;
  };
  const nearTrails = (((trailsQ?.data as TrailLite[]) ?? [])
    .map((tr) => ({
      id: tr.id,
      name: tr.name,
      sport: tr.sport,
      stats: tr.stats,
      distKm: haversineKm(hl.lon, hl.lat, tr.start_lon, tr.start_lat),
      coords: tr.thumb_coords ?? undefined,
    }))
    .filter((tr) => tr.distKm <= 20)
    .sort((a, b) => a.distKm - b.distKm)
    .slice(0, Math.max(0, 6 - nearTours.length)));

  const nearRoutes = [
    ...nearTours.map((tr) => ({
      ...tr,
      href: `/${locale}/tour/${tr.id}`,
      official: false,
    })),
    ...nearTrails.map((tr) => ({
      ...tr,
      href: `/${locale}/trail/${tr.id}`,
      official: true,
    })),
  ];

  const nearHighlights = (
    ((nearbyQ.data as (Highlight & { category: string })[]) ?? [])
      .filter((h) => h.id !== hl.id)
      .map((h) => ({ ...h, distKm: haversineKm(hl.lon, hl.lat, h.lon, h.lat) }))
      .sort((a, b) => a.distKm - b.distKm)
      .slice(0, 8)
  );

  // Middelste breadcrumb-crumb: link naar de regio-categoriepagina ("Toppen in
  // Bayern") als die bestaat, anders de kale categorie-tekst ("Top"). Zo leidt
  // de breadcrumb terug naar de bovenliggende lijst i.p.v. dood tekst te zijn.
  const regionRows = (regionQ.data as { country: string | null }[] | null) ?? [];
  const regionCrumb =
    hl.region && regionRows.length > 0
      ? {
          href: `/${locale}/discover/${regionSlugFor(
            hl.region,
            hl.country,
            regionRows.length > 1,
          )}/${hl.category}`,
          label: `${tr(`catPlural.${hl.category}` as never)} in ${hl.region}`,
        }
      : null;

  const storageBase = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/highlight-photos/`;
  // atrole=dest: "Breng me hierheen" zet de POI als BESTEMMING (navigeer
  // ernaartoe), niet als startpunt.
  const plannerHref = `/${locale}?at=${hl.lon.toFixed(5)},${hl.lat.toFixed(5)}&atn=${encodeURIComponent(hl.name)}&atrole=dest`;

  return (
    <main className="mx-auto min-h-dvh max-w-4xl px-4 pb-16 pt-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "TouristAttraction",
            name: hl.name,
            description: blurb ?? undefined,
            geo: { "@type": "GeoCoordinates", latitude: hl.lat, longitude: hl.lon },
            ...(place ? { address: place } : {}),
          }),
        }}
      />
      {/* BreadcrumbList voor Google rich results (matcht de zichtbare breadcrumb):
          Ontdekken → regio-categorie → hoogtepunt. De middelste crumb bestaat
          alleen als er een regio-categoriepagina is (regionCrumb). */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              { name: t("breadcrumbDiscover"), url: `${SITE_URL}/${locale}/discover` },
              ...(regionCrumb
                ? [{ name: regionCrumb.label, url: `${SITE_URL}${regionCrumb.href}` }]
                : []),
              { name: hl.name, url: `${SITE_URL}/${locale}/highlight/${params.id}` },
            ].map((c, i) => ({
              "@type": "ListItem",
              position: i + 1,
              name: c.name,
              item: c.url,
            })),
          }),
        }}
      />

      {/* Breadcrumb-lite */}
      <nav className="mt-2 text-xs text-neutral-400">
        <a href={`/${locale}/discover`} className="hover:underline">
          {t("breadcrumbDiscover")}
        </a>
        {" / "}
        {regionCrumb ? (
          <a href={regionCrumb.href} className="hover:underline">
            {regionCrumb.label}
          </a>
        ) : (
          <span>{t(`cat.${hl.category}` as never)}</span>
        )}
        {" / "}
        <span className="text-neutral-600">{hl.name}</span>
      </nav>

      {/* Photo grid or gradient hero */}
      {photos.length > 0 ? (
        <div className="mt-3 grid h-56 grid-cols-3 gap-1 overflow-hidden rounded-2xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`${storageBase}${photos[0].path}`}
            alt={hl.name}
            className="col-span-2 h-full w-full object-cover"
          />
          <div className="grid grid-rows-2 gap-1">
            {photos.slice(1, 3).map((p) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={p.id}
                src={`${storageBase}${p.path}`}
                alt=""
                className="h-full w-full object-cover"
              />
            ))}
          </div>
        </div>
      ) : (
        <div
          className={`mt-3 flex h-40 items-center justify-center rounded-2xl bg-gradient-to-br ${gradientFor()}`}
        >
          <span className="text-6xl opacity-90 drop-shadow">
            {CATEGORY_EMOJI[hl.category] ?? "📍"}
          </span>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-medium uppercase tracking-wide text-amber-700">
            {CATEGORY_EMOJI[hl.category]} {t("kind")} • {t(`cat.${hl.category}` as never)}
          </div>
          <h1 className="mt-1 text-3xl font-semibold text-neutral-900">{hl.name}</h1>
          {place && (
            <p className="mt-1 text-sm text-neutral-500">
              {t("location")}: {place}
            </p>
          )}
        </div>
        <div className="flex shrink-0 gap-2">
          <a
            href={plannerHref}
            className="rounded-full bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
          >
            {t("bringMeHere")}
          </a>
          <ShareButton
            title={hl.name}
            className="rounded-full border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          />
        </div>
      </div>

      {/* Per-sport recommendation chips */}
      {bySport.size > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {Array.from(bySport.entries()).map(([sport, { pos, total }]) => (
            <span
              key={sport}
              className="rounded-full border border-neutral-200 px-2.5 py-1 text-xs text-neutral-700"
            >
              {sport === "all" ? t("allSports") : ts(sport as never)} ·{" "}
              <span className="font-semibold">
                {Math.round((pos / total) * 100)}%
              </span>{" "}
              <span className="text-neutral-400">({total})</span>
            </span>
          ))}
        </div>
      )}

      {blurb && (
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-neutral-700">
          {blurb}
        </p>
      )}

      <div className="mt-6 grid gap-8 md:grid-cols-[1fr_320px]">
        <div className="min-w-0">
          {/* Interactive contribution island: vote / tip / photo */}
          <HighlightActions highlightId={hl.id} />

          {/* Tips */}
          <h2 className="mt-8 text-lg font-semibold text-neutral-900">
            {t("tips")}
          </h2>
          {tips.length === 0 ? (
            <p className="mt-2 text-sm text-neutral-400">{t("noTips")}</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-4">
              {tips.map((tip) => {
                const tipName = tip.profile?.display_name ?? t("anonymous");
                return (
                  <li key={tip.id} className="border-b border-neutral-100 pb-3">
                    <div className="flex items-center gap-1.5 text-xs text-neutral-400">
                      <Avatar
                        name={tipName}
                        url={tip.profile?.avatar_url ?? null}
                        size={16}
                      />
                      {tip.author ? (
                        <a
                          href={`/${locale}/user/${tip.author}`}
                          className="font-medium text-neutral-600 hover:underline"
                        >
                          {tipName}
                        </a>
                      ) : (
                        <span className="font-medium text-neutral-600">{tipName}</span>
                      )}
                      <span>
                        · {new Date(tip.created_at).toLocaleDateString(locale)}
                        {tip.sport ? ` · ${ts(tip.sport as never)}` : ""}
                      </span>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-700">
                      {tip.text}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}

          {/* Nearby routes */}
          <h2 id="nearby" className="mt-8 text-lg font-semibold text-neutral-900">
            {t("nearbyRoutes")}
          </h2>
          {nearRoutes.length === 0 ? (
            <p className="mt-2 text-sm text-neutral-400">{t("noRoutes")}</p>
          ) : (
            <div className="mt-3 flex flex-col gap-2">
              {nearRoutes.map((tr, i) => (
                <a
                  key={tr.id}
                  href={tr.href}
                  className="flex items-center gap-3 rounded-xl border border-neutral-100 bg-white p-3 shadow-sm transition hover:shadow-md"
                >
                  {tr.coords && tr.coords.length > 1 && (
                    <div className="h-12 w-16 shrink-0 overflow-hidden rounded-lg border border-neutral-100 bg-neutral-50/60 p-0.5">
                      <MiniMap coords={tr.coords} className="h-full w-full" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="truncate font-medium text-neutral-900">
                      <span className="mr-1 text-neutral-400">#{i + 1}</span>
                      {/* ✓ = officiële (OSM-bewegwijzerde) route, consistent met
                          de tour-related-lijst en de "✓ Officiële routes"-sectie
                          op /discover; onderscheidt ze van community-tours. */}
                      {tr.official && (
                        <span
                          className="mr-1 text-xs font-bold text-emerald-600"
                          title={t("officialRoute")}
                          aria-label={t("officialRoute")}
                        >
                          ✓
                        </span>
                      )}
                      {tr.name}
                    </div>
                    <div className="mt-0.5 text-xs text-neutral-500">
                      {(tr.stats.distanceM / 1000).toFixed(1)} km · ↗{" "}
                      {tr.stats.ascendM} m ·{" "}
                      <span className="capitalize">{ts(tr.sport as never)}</span> ·{" "}
                      {Math.round(tr.distKm)} km {t("away")}
                    </div>
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>

        <aside>
          <HighlightMap
            lon={hl.lon}
            lat={hl.lat}
            geometry={hl.kind === "segment" ? hl.geometry : undefined}
            color={CATEGORY_COLOR[hl.category] ?? undefined}
          />

          {/* Weather + packing tip */}
          {weather && (
            <div className="mt-4 rounded-xl border border-neutral-100 bg-white p-3 shadow-sm">
              <h3 className="text-sm font-semibold text-neutral-900">
                {t("weather")}
              </h3>
              <div className="mt-2 flex gap-2 overflow-x-auto text-center">
                {weather.days.map((d) => (
                  <div key={d.date} className="min-w-12 shrink-0">
                    <div className="text-[10px] text-neutral-400">
                      {new Date(d.date).toLocaleDateString(locale, {
                        weekday: "short",
                      })}
                    </div>
                    <div className="text-base leading-none">{wmoEmoji(d.code)}</div>
                    <div className="text-sm font-medium">{d.tMax}°</div>
                    <div className="text-[11px] text-neutral-400">{d.tMin}°</div>
                    <div className="text-[10px] text-sky-600">{d.rain}%</div>
                  </div>
                ))}
              </div>
              {weather.packTip && (
                <p className="mt-2 rounded-lg bg-neutral-50 px-2 py-1.5 text-xs text-neutral-600">
                  {t(`pack.${weather.packTip}` as never)}
                </p>
              )}
            </div>
          )}

          {/* Nearby highlights — the internal-linking mesh */}
          {nearHighlights.length > 0 && (
            <div className="mt-4">
              <h3 className="text-sm font-semibold text-neutral-900">
                {t("nearbyHighlights")}
              </h3>
              <ul className="mt-2 flex flex-col gap-1">
                {nearHighlights.map((h) => (
                  <li key={h.id}>
                    <a
                      href={`/${locale}/highlight/${h.id}`}
                      className="flex items-baseline justify-between gap-2 text-sm text-neutral-700 hover:text-emerald-800"
                    >
                      <span className="min-w-0 truncate">
                        {CATEGORY_EMOJI[h.category]} {h.name}
                      </span>
                      <span className="shrink-0 text-xs text-neutral-400">
                        {h.distKm < 1
                          ? `${Math.round(h.distKm * 1000)} m`
                          : `${h.distKm.toFixed(1)} km`}
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>

      <SiteFooter />
    </main>
  );
}
