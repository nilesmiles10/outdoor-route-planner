import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { supabaseServer } from "@/lib/supabase/server";
import { getWeather } from "@/lib/weather";
import { buildAutoDesc } from "@/lib/autoDesc";
import { CATEGORY_EMOJI } from "@/lib/highlights";
import { sportFamily } from "@/lib/geo";
import TourView from "@/components/TourView";
import { SITE_URL } from "@/app/sitemap";
import { getTour } from "./data";

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

// Komoot-style auto description (GEN-132), templated from difficulty +
// surface aggregates.
export async function generateMetadata({
  params,
}: {
  params: { id: string; locale: string };
}): Promise<Metadata> {
  const tour = await getTour(params.id);
  if (!tour)
    return {
      title: (await getTranslations({ locale: params.locale, namespace: "notFound" }))("title"),
    };
  const km = (tour.stats.distanceM / 1000).toFixed(1);
  const t = await getTranslations("tourPage");
  const ts = await getTranslations("planner.sports");
  // Gelabelde + gelokaliseerde sport i.p.v. de ruwe sleutel: titel/OG toonden
  // "road"/"touring"/"ebike" i.p.v. "Road bike"/"Bike touring"/"E-bike" (NL:
  // "Racefiets"/"Fietsen"). Zichtbaar in zoekresultaten, browsertab en share-
  // cards van de geïndexeerde tourpagina's.
  const sportLabel = ts(tour.sport as never);
  const authorName = tour.profile?.display_name ?? t("anonymous");
  // Route-specifieke OG/Twitter: zonder deze erfden gedeelde tour-links de
  // generieke layout-OG ("Tarnoo" / "Plan your next adventure") — elke
  // gedeelde route zag er identiek uit. De OG-afbeelding komt al per tour uit
  // de opengraph-image-route; alleen titel/omschrijving + large-image-card.
  const ogTitle = `${tour.name} · ${km} km ${sportLabel}`;
  const ogDesc = `${km} km · ↗ ${tour.stats.ascendM} m — ${buildAutoDesc(t, tour)}`;
  return {
    title: `${tour.name} | ${km} km ${sportLabel}`,
    description: `${ogDesc} · ${t("byline", { name: authorName })}`,
    // Self-canonical: tracking-param-varianten consolideren naar de schone URL.
    alternates: { canonical: `/${params.locale}/tour/${params.id}` },
    openGraph: { title: ogTitle, description: ogDesc },
    twitter: { card: "summary_large_image", title: ogTitle, description: ogDesc },
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
  const tNav = await getTranslations("nav");

  const km = (tour.stats.distanceM / 1000).toFixed(1);
  const h = Math.floor(tour.stats.timeS / 3600);
  const m = Math.round((tour.stats.timeS % 3600) / 60);
  const start = tour.waypoints[0];

  const sb = supabaseServer();
  const [weather, toursQ, hlQ, collQ, trailsQ, sameSportTrailsQ] = await Promise.all([
    start ? getWeather(start.lon, start.lat) : null,
    sb
      .from("tours")
      .select("id,name,sport,stats,waypoints")
      .eq("visibility", "public")
      .eq("kind", "planned")
      .neq("id", tour.id)
      .limit(100),
    // Bbox rond de route i.p.v. de hele tabel. `.limit(2000)` leverde door de
    // PostgREST max-rows-cap 1000 wíllekeurige (= oudste, dus NL/BE) punten uit
    // 500k: buiten NL/BE waren zowel "in de buurt" als de Onderweg-lijst
    // daardoor stil leeg. PAD ≈ 16 km rond de track.
    (() => {
      const cs = tour.geometry.coordinates;
      const PAD = 0.15;
      const lons = cs.map((c) => c[0]);
      const lats = cs.map((c) => c[1]);
      return sb
        .from("highlights")
        .select("id,name,category,lon,lat")
        .eq("kind", "point")
        .gte("lon", Math.min(...lons) - PAD)
        .lte("lon", Math.max(...lons) + PAD)
        .gte("lat", Math.min(...lats) - PAD)
        .lte("lat", Math.max(...lats) + PAD)
        .limit(1000);
    })(),
    // Publieke collecties waar deze route in zit — terug-link naar de curatie.
    // RLS beperkt al tot zichtbare collecties; visibility filteren we alsnog in
    // JS zodat een gedeelde route nooit naar een niet-publieke collectie linkt.
    sb
      .from("collection_items")
      .select("collections(id,title,visibility)")
      .eq("tour_id", tour.id),
    // Nabije officiële trails (start binnen een bbox rond de route-start) —
    // vult de vaak schaarse community-"Ook interessant" (≈24 tours) aan met de
    // 4.4k-trails-dataset. Start-gebaseerde nabijheid, net als relatedTours.
    start
      ? sb
          .from("trails")
          .select("id,name,sport,stats,thumb_coords,start_lon,start_lat")
          .gte("start_lon", start.lon - 0.5)
          .lte("start_lon", start.lon + 0.5)
          .gte("start_lat", start.lat - 0.5)
          .lte("start_lat", start.lat + 0.5)
          .limit(60)
      : null,
    // Aparte, gegarandeerde zelfde-sport-fetch: de algemene bbox-query hierboven
    // heeft geen ORDER BY, dus de .limit(60) kan minderheids-sporten volledig
    // wegdrukken (Utrecht-bbox = 802 hike vs 8 touring → touring viel buiten de
    // 60, waardoor de sport-eerst-sort niets te promoten had). Deze query pakt
    // ze expliciet zodat ze in de kandidatenpool zitten; any-sport blijft fill.
    start
      ? sb
          .from("trails")
          .select("id,name,sport,stats,thumb_coords,start_lon,start_lat")
          .eq("sport", tour.sport)
          .gte("start_lon", start.lon - 0.5)
          .lte("start_lon", start.lon + 0.5)
          .gte("start_lat", start.lat - 0.5)
          .lte("start_lat", start.lat + 0.5)
          .limit(30)
      : null,
  ]);

  type TourLite = {
    id: string;
    name: string;
    sport: string;
    stats: { distanceM: number; ascendM: number };
    waypoints: { lon: number; lat: number }[];
  };
  // Relevantie-tier voor gerelateerde routes: 0 = exact zelfde sport,
  // 1 = zelfde familie (fiets/voet), 2 = andere familie. Zie sportFamily.
  const tourFamily = sportFamily(tour.sport);
  const sportTier = (s: string) =>
    s === tour.sport ? 0 : sportFamily(s) === tourFamily ? 1 : 2;

  const relatedTours = start
    ? (((toursQ.data as TourLite[]) ?? [])
        .map((tr) => ({
          ...tr,
          distKm: tr.waypoints[0]
            ? haversineKm(start.lon, start.lat, tr.waypoints[0].lon, tr.waypoints[0].lat)
            : Infinity,
        }))
        .filter((tr) => tr.distKm <= 40)
        // Exact sport eerst, dan zelfde familie (fiets↔fiets / voet↔voet), dan
        // pas de andere familie — elk daarbinnen op afstand. Een racefietser
        // heeft meer aan een nabije gravel-/mtb-route dan aan de dichtstbijzijnde
        // wandelroute. Reordert alleen (geen filter) → sectie blijft vol.
        .sort(
          (a, b) =>
            sportTier(a.sport) - sportTier(b.sport) || a.distKm - b.distKm,
        )
        .slice(0, 4))
    : [];

  // Nabije officiële trails, aanvullend op de (schaarse) community-tours zodat
  // de "Ook interessant"-sectie ook op tour-pagina's echt vult. Start-afstand,
  // ≤40 km, en samen met de community-tours gecapt op 6 kaarten.
  type TrailLite = {
    id: string;
    name: string;
    sport: string;
    stats: { distanceM: number; ascendM: number };
    thumb_coords: [number, number][] | null;
    start_lon: number;
    start_lat: number;
  };
  // Zelfde-sport-fetch + algemene bbox-fetch samenvoegen, dedup op id (een
  // zelfde-sport-trail zit in beide). De sport-eerst-sort hieronder floats de
  // zelfde-sport-treffers naar boven; any-sport blijft achteraan als fill.
  const trailPool = (() => {
    const byId = new Map<string, TrailLite>();
    for (const tr of [
      ...((sameSportTrailsQ?.data as TrailLite[]) ?? []),
      ...((trailsQ?.data as TrailLite[]) ?? []),
    ]) {
      if (!byId.has(tr.id)) byId.set(tr.id, tr);
    }
    return Array.from(byId.values());
  })();
  const nearbyTrails = start
    ? (trailPool
        .map((tr) => ({
          ...tr,
          distKm: haversineKm(start.lon, start.lat, tr.start_lon, tr.start_lat),
        }))
        .filter((tr) => tr.distKm <= 40)
        // Zelfde tier-logica als relatedTours: exact sport → zelfde familie →
        // andere familie, daarbinnen op afstand.
        .sort(
          (a, b) =>
            sportTier(a.sport) - sportTier(b.sport) || a.distKm - b.distKm,
        )
        .slice(0, Math.max(0, 6 - relatedTours.length)))
    : [];

  // Route-vorm-thumbnails: haal alléén de geometrie van de 4 getoonde routes op
  // (niet van alle 100 kandidaten) — id→coords-map voor de MiniMap in TourView.
  const relatedGeo = new Map<string, [number, number][]>();
  if (relatedTours.length) {
    const { data: geos } = await sb
      .from("tours")
      .select("id,thumb_coords")
      .in(
        "id",
        relatedTours.map((tr) => tr.id),
      );
    for (const g of (geos as {
      id: string;
      thumb_coords: [number, number][] | null;
    }[]) ?? []) {
      if (g.thumb_coords) relatedGeo.set(g.id, g.thumb_coords);
    }
  }

  type Hl = { id: string; name: string; category: string; lon: number; lat: number };
  const relatedHls = start
    ? (((hlQ.data as Hl[]) ?? [])
        .map((hl) => ({
          ...hl,
          distKm: haversineKm(start.lon, start.lat, hl.lon, hl.lat),
        }))
        // Highlights zijn sport-neutraal (een kasteel is voor elke sport
        // interessant) → puur op afstand.
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

  // Komoot-teardown: "Tip van {naam}" bij highlights op de route — recentste
  // tip per passed highlight, auteur via de dual-FK profiles-embed.
  type TipRow = {
    highlight_id: string;
    text: string;
    profile: { display_name: string | null } | null;
  };
  const tipByHighlight = new Map<string, TipRow>();
  if (passed.length > 0) {
    const { data: tipRows } = await sb
      .from("highlight_tips")
      .select(
        "highlight_id,text,profile:profiles!highlight_tips_author_profiles_fkey(display_name)",
      )
      .in(
        "highlight_id",
        passed.map((hl) => hl.id),
      )
      .order("created_at", { ascending: false })
      .limit(40);
    for (const row of (tipRows as TipRow[] | null) ?? []) {
      if (!tipByHighlight.has(row.highlight_id)) tipByHighlight.set(row.highlight_id, row);
    }
  }

  const autoDesc = buildAutoDesc(t, tour);
  type CollRow = {
    collections: { id: string; title: string; visibility: string } | null;
  };
  const tourCollections = ((collQ.data as CollRow[] | null) ?? [])
    .map((r) => r.collections)
    .filter(
      (c): c is { id: string; title: string; visibility: string } =>
        !!c && c.visibility === "public",
    )
    .map((c) => ({ id: c.id, title: c.title, href: `/${locale}/collection/${c.id}` }));
  const authorName = tour.profile?.display_name ?? t("anonymous");
  const authorDate = new Date(
    tour.kind === "completed" && tour.recorded_at ? tour.recorded_at : tour.updated_at,
  ).toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" });

  const isActivity = tour.kind === "completed" && !!tour.time_offsets;
  const avgKmh =
    isActivity && tour.moving_s
      ? (tour.stats.distanceM / 1000 / (tour.moving_s / 3600)).toFixed(1)
      : null;

  // Community-tours worden ontdekt via /discover → breadcrumb "Ontdekken › naam".
  // Eén bron voor de zichtbare breadcrumb én de BreadcrumbList-JSON-LD.
  const crumbs = [{ label: tNav("discover"), href: `/${locale}/discover` }];

  return (
    <main className="relative h-dvh w-full">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Trip",
            name: tour.name,
            description: `${km} km ${ts(tour.sport as never)} route — ${autoDesc}`,
            author: { "@type": "Person", name: authorName },
            itinerary: tour.waypoints.map((w) => ({
              "@type": "Place",
              name: w.name,
              geo: { "@type": "GeoCoordinates", latitude: w.lat, longitude: w.lon },
            })),
          }),
        }}
      />
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
                name: tour.name,
                item: `${SITE_URL}/${locale}/tour/${params.id}`,
              },
            ],
          }),
        }}
      />
      <TourView
        breadcrumb={crumbs}
        geometry={tour.geometry}
        elevation={tour.elevation}
        waypoints={tour.waypoints}
        highlightPins={{
          type: "FeatureCollection",
          features: passed.map((hl) => ({
            type: "Feature",
            properties: { id: hl.id, name: hl.name, category: hl.category },
            geometry: { type: "Point", coordinates: [hl.lon, hl.lat] },
          })),
        }}
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
          embedLabel: t("embed"),
          embedCopied: t("embedCopied"),
        }}
        embedId={tour.visibility === "public" ? tour.id : null}
        durationS={tour.stats.timeS}
        turns={tour.turns}
        waytypes={tour.waytypes}
        author={{
          href: `/${locale}/user/${tour.owner}`,
          name: authorName,
          avatarUrl: tour.profile?.avatar_url ?? null,
          label: t(tour.kind === "completed" ? "authorCompleted" : "authorPlanned"),
          dateLabel: authorDate,
        }}
        collections={tourCollections}
        collectionsLabel={t("inCollections")}
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
          officialLabel: t("officialRoute"),
          tours: [
            ...relatedTours.map((tr) => ({
              href: `/${locale}/tour/${tr.id}`,
              name: tr.name,
              meta: `${(tr.stats.distanceM / 1000).toFixed(1)} km · ↗ ${tr.stats.ascendM} m · ${ts(tr.sport as never)} · ${Math.round(tr.distKm)} km ${t("away")}`,
              coords: relatedGeo.get(tr.id),
            })),
            ...nearbyTrails.map((tr) => ({
              href: `/${locale}/trail/${tr.id}`,
              name: tr.name,
              meta: `${(tr.stats.distanceM / 1000).toFixed(1)} km · ↗ ${tr.stats.ascendM} m · ${ts(tr.sport as never)} · ${Math.round(tr.distKm)} km ${t("away")}`,
              coords: tr.thumb_coords ?? undefined,
              official: true,
            })),
          ],
          passedTitle: t("activity.onRoute"),
          passed: passed.map((hl) => {
            const tip = tipByHighlight.get(hl.id);
            return {
              href: `/${locale}/highlight/${hl.id}`,
              name: `${CATEGORY_EMOJI[hl.category] ?? "📍"} ${hl.name}`,
              meta: `km ${hl.atKm.toFixed(1)}`,
              tipText: tip?.text ?? null,
              tipBy: tip
                ? `${t("tipBy")} ${tip.profile?.display_name ?? t("anonymous")}`
                : null,
            };
          }),
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
