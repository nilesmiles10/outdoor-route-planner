"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import MapView, { type Waypoint } from "./MapView";
import ElevationChart from "./ElevationChart";
import GradeLegend from "./GradeLegend";
import SpeedChart from "./SpeedChart";
import MiniMap from "./MiniMap";
import { wmoEmoji } from "@/lib/weather";
import TourSocial from "./TourSocial";
import Avatar from "./Avatar";
import { cumulativeDistances, detectClimbs, haversineM } from "@/lib/elevation";
import { difficulty } from "@/lib/difficulty";
import { groupWaytypes } from "@/lib/waytypes";
import { buildKmMarkers } from "@/lib/kmMarkers";
import { speedSeries, fmtDuration } from "@/lib/activity";
import ExportMenu from "./ExportMenu";
import type { CourseTurn } from "@/lib/course";

type Props = {
  geometry: GeoJSON.LineString;
  elevation: number[];
  waypoints: Waypoint[];
  // GEN-117: highlights die de route passeert, als kaart-pins (naast de
  // panel-lijst). Optioneel — komt uit de server-query met coords.
  highlightPins?: GeoJSON.FeatureCollection | null;
  header: {
    name: string;
    sport: string;
    km: string;
    time: string;
    ascend: number;
    descend: number;
    buckets: { paved: number; unpaved: number; unknown: number };
    planLabel: string;
    gpxLabel: string;
    embedLabel?: string;
    embedCopied?: string;
  };
  // GEN-135: present on public tours — id for the iframe snippet.
  embedId?: string | null;
  // GEN-143: course-export (TCX/FIT) — duur voor virtual partner +
  // turn-instructies (null bij oude tours/uploads).
  durationS?: number;
  turns?: CourseTurn[] | null;
  // GEN: Komoot-stijl waytype-uitsplitsing (cycleway/path/road/street km).
  // Opgeslagen op tour én trail; zonder dit toonde de detailpagina alleen de
  // verhard/onverhard-balk, niet wélke wegtypes de route gebruikt.
  waytypes?: Record<string, number> | null;
  // Auteur-attributie (Komoot teardown): breadcrumb + avatar-blok boven de
  // titel; alle strings server-side vertaald.
  author?: {
    href: string;
    name: string;
    avatarUrl: string | null;
    label: string;
    dateLabel: string;
  } | null;
  // GEN-145: bron-attributie voor officiële trails (i.p.v. auteur) —
  // ODbL vereist zichtbare OSM-attributie op geïmporteerde routes.
  source?: {
    badge: string;       // "Officiële route"
    detail: string;      // "beheerder X · gegevens © OpenStreetMap-bijdragers"
    href: string;        // OSM-relatie-URL
    linkText: string;    // "Bekijk op OpenStreetMap"
  } | null;
  // Breadcrumb (officiële routes hebben regio/land → Trails › regio › naam).
  // Verbetert navigatie terug naar de lijst + intern SEO-linkmesh. Tours laten
  // dit weg (geen regio-context).
  breadcrumb?: { label: string; href: string }[];
  // Publieke collecties waar deze route in zit — terug-link naar de curatie-
  // context (collecties linken naar routes; dit sluit de graaf de andere kant op).
  collections?: { id: string; title: string; href: string }[];
  collectionsLabel?: string; // "In collectie"
  // Tour page v2 (GEN-132): all strings pre-translated server-side.
  autoDesc?: string;
  weather?: {
    title: string;
    days: {
      date: string;
      label: string;
      tMax: number;
      tMin: number;
      rain: number;
      code: number;
    }[];
    packTip: string | null;
  } | null;
  related?: {
    toursTitle: string;
    tours: {
      href: string;
      name: string;
      meta: string;
      coords?: [number, number][];
    }[];
    passedTitle?: string;
    passed?: {
      href: string;
      name: string;
      meta: string;
      tipText?: string | null;
      tipBy?: string | null;
    }[];
    highlightsTitle: string;
    highlights: { href: string; name: string; meta: string }[];
  };
  // GEN-118: likes + comments block at the bottom of the panel.
  social?: { tourId: string; tourOwner: string } | null;
  // GEN-117: present on completed activities — speed profile + recording stats.
  activity?: {
    timeOffsets: number[];
    recordedLabel: string;
    movingLabel: string;
    elapsedLabel: string;
    avgLabel: string;
    maxLabel: string;
    segmentLabel: string;
    movingS: number;
    durationS: number;
    avgKmh: string;
    maxKmh: number;
  } | null;
};

const noop = () => {};

// Planner-punten voor "Open in planner". Een tour levert echte waypoints
// (start/via/eind) → gebruik die. Een trail (OSM-route) heeft er maar één
// (het startpunt); daarmee zou de link `?w=lon,lat` één punt bevatten en de
// planner negeert dat (hij eist ≥2 punten) → lege planner. Bemonster dan
// gelijkmatig langs de geometrie zodat de planner de trail benaderend
// herbouwt. Cap 8 (BRouter routeert max 10 punten). Werkt ook voor
// roundtrip-trails (start≈eind): de tussenpunten houden de lus intact.
function plannerWaypointsFrom(
  waypoints: Waypoint[],
  coords: GeoJSON.Position[],
): [number, number][] {
  if (waypoints.length >= 2) {
    return waypoints.map((p) => [p.lon, p.lat]);
  }
  const n = Math.min(8, coords.length);
  if (n < 2) return coords.map((c) => [c[0], c[1]]);
  return Array.from({ length: n }, (_, i) => {
    const c = coords[Math.round((i * (coords.length - 1)) / (n - 1))];
    return [c[0], c[1]];
  });
}

export default function TourView({
  geometry,
  elevation,
  waypoints,
  highlightPins,
  header,
  author,
  autoDesc,
  weather,
  related,
  social,
  activity,
  embedId,
  durationS,
  turns,
  waytypes,
  source,
  collections,
  collectionsLabel,
  breadcrumb,
}: Props) {
  const t = useTranslations("planner");
  const locale = useLocale();
  const [embedCopied, setEmbedCopied] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  // Klik op een klim → vlieg de kaart naar het beginpunt (zie planner). Teller
  // `n` maakt herhaald klikken op dezelfde klim herhaalbaar.
  const [focusReq, setFocusReq] = useState<{
    lon: number;
    lat: number;
    n: number;
  } | null>(null);
  const focusOnIndex = (idx: number) => {
    const c = geometry.coordinates[idx];
    if (c) setFocusReq((prev) => ({ lon: c[0], lat: c[1], n: (prev?.n ?? 0) + 1 }));
  };
  // Mobiel: info-paneel inklapbaar zodat de kaart-first-flow de route vrij
  // laat verkennen i.p.v. permanent 45dvh aan het paneel kwijt te zijn.
  // Zelfde patroon als de planner (grab-handle, md:hidden).
  const [sheetCollapsed, setSheetCollapsed] = useState(false);
  const feature: GeoJSON.Feature = useMemo(
    () => ({ type: "Feature", properties: {}, geometry }),
    [geometry],
  );
  const distances = useMemo(
    () => cumulativeDistances(geometry.coordinates),
    [geometry],
  );
  // Afstandsmarkers langs de route (GEN-137-patroon uit de planner): elke
  // 5 km, of 10 km op lange routes. De tour-kaart toonde ze nog niet terwijl
  // de planner ze wél heeft — zelfde route-informatie hoort er ook hier te
  // staan. Afgeleid uit de al berekende coords + distances, geen extra data.
  const kmMarkers = useMemo<GeoJSON.FeatureCollection | null>(
    () => buildKmMarkers(geometry.coordinates, distances),
    [geometry, distances],
  );
  const climbs = useMemo(
    () => detectClimbs(elevation, distances),
    [elevation, distances],
  );
  const speeds = useMemo(
    () =>
      activity ? speedSeries(geometry.coordinates, activity.timeOffsets) : null,
    [activity, geometry],
  );
  const total = header.buckets.paved + header.buckets.unpaved + header.buckets.unknown;
  // Locale-prefix i.p.v. kaal `/?w=`: zonder prefix moet de next-intl-middleware
  // de taal alsnog raden. Zonder NEXT_LOCALE-cookie/nl-Accept-Language landde een
  // NL-bezoeker via een 307 op /en — "Open in planner" wisselde de taal. Mét
  // prefix gaat het direct naar de huidige taal (geen redirect), consistent met
  // alle andere links.
  const plannerHref = `/${locale}?w=${plannerWaypointsFrom(waypoints, geometry.coordinates)
    .map(([lon, lat]) => `${lon.toFixed(5)},${lat.toFixed(5)}`)
    .join(";")}&sport=${header.sport}`;

  const exportData = () => ({
    name: header.name,
    sport: header.sport,
    coords: geometry.coordinates,
    elevation,
    waypoints,
    durationS: durationS ?? 3600,
    turns,
  });

  // Rondje vs enkele richting: start ≈ eind (< 100 m) = rondje. Uit de geometry
  // afgeleid (niet een veld) zodat het voor tours én trails klopt. Route-info
  // die de detailpagina miste (de map toont het impliciet via groen/rood).
  const isLoop = useMemo(() => {
    const c = geometry.coordinates;
    return c.length >= 2 && haversineM(c[0], c[c.length - 1]) < 100;
  }, [geometry]);

  return (
    <>
      <MapView
        route={feature}
        waypoints={waypoints}
        kmMarkers={kmMarkers}
        highlights={highlightPins}
        onHighlightClick={(h) => {
          window.location.href = `/${locale}/highlight/${h.id}`;
        }}
        hoverPoint={hoverIdx !== null ? geometry.coordinates[hoverIdx] ?? null : null}
        onRouteHover={setHoverIdx}
        focusPoint={focusReq}
        onMapClick={noop}
        onMarkerDragEnd={noop}
        onRouteDrop={noop}
      />
      <div
        className={`absolute flex flex-col gap-3 overflow-y-auto rounded-2xl bg-white/95 p-4 shadow-xl backdrop-blur max-md:inset-x-2 max-md:bottom-2 md:left-4 md:top-16 md:max-h-[calc(100dvh-5rem)] md:w-[340px] ${
          sheetCollapsed
            ? "max-md:max-h-[7rem] max-md:overflow-hidden"
            : "max-md:max-h-[45dvh]"
        }`}
      >
        {/* Mobiele grab-handle: tik om het paneel in/uit te klappen en de
            kaart terug te winnen. Verborgen op desktop (vaste zijbalk). */}
        <button
          type="button"
          onClick={() => setSheetCollapsed((v) => !v)}
          aria-expanded={!sheetCollapsed}
          aria-label={sheetCollapsed ? t("expandPanel") : t("collapsePanel")}
          className="mx-auto -mt-1 mb-1 flex h-5 w-full items-center justify-center md:hidden"
        >
          <span className="h-1.5 w-10 rounded-full bg-neutral-300" />
        </button>
        {/* Ingeklapte peek: zonder dit toont het dichtgeklapte paneel niets
            bruikbaars (alleen de grip), dus wie de kaart verkent verliest naam
            + kerncijfers van de route. Compacte samenvatting houdt de identiteit
            en afstand/moeilijkheid zichtbaar. Alleen mobiel + alleen ingeklapt
            (anders dubbelt het met de titel/badge hieronder). */}
        {sheetCollapsed && (
          <div className="flex items-center gap-2 md:hidden">
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-neutral-900">
              {header.name}
            </span>
            <span className="shrink-0 text-xs font-medium text-neutral-500">
              {header.km} km
            </span>
            {(() => {
              const d = difficulty(
                header.sport,
                parseFloat(header.km) * 1000,
                header.ascend,
              );
              return (
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    d === "easy"
                      ? "bg-emerald-100 text-emerald-800"
                      : d === "moderate"
                        ? "bg-amber-100 text-amber-800"
                        : "bg-red-100 text-red-800"
                  }`}
                >
                  {t(`difficultyLabels.${d}` as never)}
                </span>
              );
            })()}
          </div>
        )}
        <div>
          {author && (
            <>
              <nav className="truncate text-[11px] text-neutral-400">
                <a href={author.href} className="hover:underline">
                  {author.name}
                </a>
                {" / "}
                <span className="text-neutral-600">{header.name}</span>
              </nav>
              <div className="mb-1.5 mt-1.5 flex items-center gap-2">
                <Avatar name={author.name} url={author.avatarUrl} size={32} />
                <div className="min-w-0 text-xs leading-tight">
                  <div className="truncate">
                    <a
                      href={author.href}
                      className="font-medium text-emerald-800 hover:underline"
                    >
                      {author.name}
                    </a>{" "}
                    <span className="text-neutral-600">{author.label}</span>
                  </div>
                  <div className="text-[10px] text-neutral-400">
                    {author.dateLabel}
                  </div>
                </div>
              </div>
            </>
          )}
          {collections && collections.length > 0 && (
            <div className="mb-1.5 text-[11px] text-neutral-500">
              {collectionsLabel}{" "}
              {collections.map((c, i) => (
                <span key={c.id}>
                  {i > 0 && " · "}
                  <a
                    href={c.href}
                    className="text-emerald-800 hover:underline"
                  >
                    📚 {c.title}
                  </a>
                </span>
              ))}
            </div>
          )}
          {breadcrumb && breadcrumb.length > 0 && (
            <nav
              aria-label="Breadcrumb"
              className="mb-1.5 flex flex-wrap items-center gap-x-1 text-[11px] text-neutral-400"
            >
              {breadcrumb.map((c, i) => (
                <span key={i} className="flex items-center gap-x-1">
                  {i > 0 && <span aria-hidden>/</span>}
                  <a href={c.href} className="hover:text-emerald-700 hover:underline">
                    {c.label}
                  </a>
                </span>
              ))}
            </nav>
          )}
          {source && (
            <div className="mb-1.5">
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                ✓ {source.badge}
              </span>
              <p className="mt-1 text-[10px] leading-snug text-neutral-500">
                {source.detail}{" "}
                <a
                  href={source.href}
                  target="_blank"
                  rel="noopener"
                  className="text-emerald-700 hover:underline"
                >
                  {source.linkText}
                </a>
              </p>
            </div>
          )}
          <h1 className="text-lg font-semibold text-neutral-900">{header.name}</h1>
          <div className="mt-0.5 flex flex-wrap items-center gap-2">
            <p className="text-xs text-neutral-500">
              {t(`sports.${header.sport}` as never)}
              {activity && (
                <span className="normal-case"> · 🏁 {activity.recordedLabel}</span>
              )}
            </p>
            {/* Moeilijkheidsgraad-badge (zelfde formule + kleuren als de
                planner). Route-info die op tour/trail eerder alleen in de
                auto-omschrijving zat, nu als visuele badge. */}
            {(() => {
              const d = difficulty(
                header.sport,
                parseFloat(header.km) * 1000,
                header.ascend,
              );
              return (
                <span
                  title={t("difficultyTooltip")}
                  className={`cursor-help rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    d === "easy"
                      ? "bg-emerald-100 text-emerald-800"
                      : d === "moderate"
                        ? "bg-amber-100 text-amber-800"
                        : "bg-red-100 text-red-800"
                  }`}
                >
                  {t(`difficultyLabels.${d}` as never)}
                </span>
              );
            })()}
            {/* Klim-telling (zelfde als de planner): detectClimbs telt de
                significante stijgingen; de grafiek toont ze al als banden. */}
            {climbs.length > 0 && (
              <span className="text-[11px] text-neutral-500">
                {t("climbsCount", { count: climbs.length })}
              </span>
            )}
            {/* Rondje/enkele richting — Komoot-signaal dat de detailpagina miste */}
            <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-600">
              {isLoop ? `🔁 ${t("loop")}` : `→ ${t("oneWay")}`}
            </span>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-2 text-center">
          <div>
            <div className="text-base font-semibold">{header.km}</div>
            <div className="text-[10px] uppercase text-neutral-500">km</div>
          </div>
          <div>
            <div className="text-base font-semibold">{header.time}</div>
            <div className="text-[10px] uppercase text-neutral-500">h</div>
          </div>
          <div>
            <div className="text-base font-semibold">↗ {header.ascend}</div>
            <div className="text-[10px] uppercase text-neutral-500">m</div>
          </div>
          <div>
            <div className="text-base font-semibold">↘ {header.descend}</div>
            <div className="text-[10px] uppercase text-neutral-500">m</div>
          </div>
        </div>
        {/* GEN-117: recording stats + speed profile */}
        {activity && (
          <div className="grid grid-cols-4 gap-2 rounded-lg bg-sky-50 px-2 py-1.5 text-center">
            <div>
              <div className="text-sm font-semibold">{fmtDuration(activity.movingS)}</div>
              <div className="text-[9px] uppercase text-neutral-500">
                {activity.movingLabel}
              </div>
            </div>
            <div>
              <div className="text-sm font-semibold">{fmtDuration(activity.durationS)}</div>
              <div className="text-[9px] uppercase text-neutral-500">
                {activity.elapsedLabel}
              </div>
            </div>
            <div>
              <div className="text-sm font-semibold">{activity.avgKmh}</div>
              <div className="text-[9px] uppercase text-neutral-500">
                {activity.avgLabel}
              </div>
            </div>
            <div>
              <div className="text-sm font-semibold">{activity.maxKmh}</div>
              <div className="text-[9px] uppercase text-neutral-500">
                {activity.maxLabel}
              </div>
            </div>
          </div>
        )}
        {activity && speeds && (
          <SpeedChart
            speeds={speeds}
            distances={distances}
            timeOffsets={activity.timeOffsets}
            elevation={elevation}
            onHover={setHoverIdx}
            segmentLabel={activity.segmentLabel}
          />
        )}
        <ElevationChart
          elevation={elevation}
          distances={distances}
          climbs={climbs}
          onHover={setHoverIdx}
          externalHoverIdx={hoverIdx}
        />
        <GradeLegend />
        {/* Klim-uitsplitsing: het profiel toont wáár het klimt, deze lijst
            zegt hoevéél — lengte/hoogtewinst/gemiddelde grade per klim. Zweven
            licht de klim op kaart + profiel op (zelfde setHoverIdx-contract als
            de planner, waar deze lijst al bestond). */}
        {climbs.length > 0 && (
          <div className="flex flex-col gap-1">
            {climbs.map((c, i) => (
              <button
                key={i}
                type="button"
                onMouseEnter={() => setHoverIdx(c.startIdx)}
                onMouseLeave={() => setHoverIdx(null)}
                onFocus={() => setHoverIdx(c.startIdx)}
                onBlur={() => setHoverIdx(null)}
                onClick={() => focusOnIndex(c.startIdx)}
                className="flex items-center justify-between rounded-lg bg-orange-50 px-2 py-1 text-left text-[11px] text-orange-900 hover:bg-orange-100"
              >
                <span>
                  ⛰ {t("climb")} {i + 1} · {t("atKm")}{" "}
                  {(c.startM / 1000).toFixed(1)}
                </span>
                <span className="font-medium">
                  {(c.lengthM / 1000).toFixed(1)} km · ↗{Math.round(c.gainM)} m ·{" "}
                  {c.avgPct.toFixed(1)}%
                </span>
              </button>
            ))}
          </div>
        )}
        {total > 0 && (
          <div className="space-y-1.5">
            <div className="flex h-2 w-full overflow-hidden rounded-full">
              <div
                className="bg-blue-600"
                style={{ width: `${(header.buckets.paved / total) * 100}%` }}
              />
              <div
                className="bg-amber-500"
                style={{ width: `${(header.buckets.unpaved / total) * 100}%` }}
              />
              <div
                className="bg-neutral-300"
                style={{ width: `${(header.buckets.unknown / total) * 100}%` }}
              />
            </div>
            {/* Legenda: zonder labels was de blauw/amber-balk betekenisloos —
                juist voor gravel-rijders telt verhard vs onverhard. km uit de
                buckets (meters). Alleen aanwezige categorieën tonen. */}
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-neutral-500">
              {header.buckets.paved > 0 && (
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 shrink-0 rounded-full bg-blue-600" />
                  {t("paved")} {(header.buckets.paved / 1000).toFixed(1)} km
                </span>
              )}
              {header.buckets.unpaved > 0 && (
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" />
                  {t("unpaved")} {(header.buckets.unpaved / 1000).toFixed(1)} km
                </span>
              )}
              {header.buckets.unknown > 0 && (
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 shrink-0 rounded-full bg-neutral-300" />
                  {t("unknown")} {(header.buckets.unknown / 1000).toFixed(1)} km
                </span>
              )}
            </div>
          </div>
        )}
        {/* Wegtype-uitsplitsing (Komoot "Way types"): wélke wegen/paden de
            route gebruikt — de verhard/onverhard-balk zegt dat niet. Ingeklapt
            (dense sheet); zelfde groepering + labels als de planner. */}
        {waytypes && Object.keys(waytypes).length > 0 && (
          <details className="text-xs">
            <summary className="cursor-pointer font-medium text-neutral-700">
              {t("waytypes")}
            </summary>
            <div className="mt-2 flex flex-col gap-0.5">
              {/* Groepen < 50 m weglaten: die zouden als "0.0 km" tonen (bv.
                  een paar meter trap) en zijn ruis in de uitsplitsing. */}
              {groupWaytypes(waytypes)
                .filter(([, v]) => v >= 50)
                .map(([k, v]) => (
                  <div key={k} className="flex justify-between text-neutral-600">
                    <span>{t(`wt.${k}` as never)}</span>
                    <span>{(v / 1000).toFixed(1)} km</span>
                  </div>
                ))}
            </div>
          </details>
        )}
        <div className="flex flex-wrap gap-2">
          <ExportMenu getData={exportData} />
          <a
            href={plannerHref}
            className="rounded-lg bg-neutral-100 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-200"
          >
            {header.planLabel}
          </a>
          {/* Route delen — kernfunctie die ontbrak. Mobiel: native share-sheet
              (navigator.share). Desktop/fallback: link naar het klembord +
              "Copied!"-bevestiging. */}
          <button
            type="button"
            onClick={async () => {
              const url = window.location.href;
              if (navigator.share) {
                try {
                  await navigator.share({ title: header.name, url });
                  return;
                } catch {
                  // gebruiker annuleerde of share faalde → val terug op kopiëren
                }
              }
              // Optimistisch (zelfde patroon als de embed-knop): niet awaiten,
              // meteen feedback tonen — writeText faalt alleen bij ontbrekende
              // user-activation, wat bij een echte klik niet gebeurt.
              navigator.clipboard?.writeText(url).catch(() => {});
              setShareCopied(true);
              setTimeout(() => setShareCopied(false), 1500);
            }}
            className="rounded-lg bg-neutral-100 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-200"
          >
            {shareCopied ? t("copied") : `↗ ${t("share")}`}
          </button>
          {embedId && header.embedLabel && (
            <button
              type="button"
              onClick={() => {
                const src = `${window.location.origin}/embed/${embedId}`;
                navigator.clipboard.writeText(
                  `<iframe src="${src}" width="100%" height="420" style="border:0;border-radius:12px" loading="lazy"></iframe>`,
                );
                setEmbedCopied(true);
                setTimeout(() => setEmbedCopied(false), 1500);
              }}
              className="rounded-lg bg-neutral-100 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-200"
            >
              {embedCopied ? header.embedCopied : `</> ${header.embedLabel}`}
            </button>
          )}
        </div>

        {/* v2 (GEN-132): auto description, weather, related content */}
        {autoDesc && (
          <p className="text-xs leading-relaxed text-neutral-600">{autoDesc}</p>
        )}

        {weather && (
          <div className="rounded-lg bg-neutral-50 p-2">
            <div className="text-xs font-medium text-neutral-700">
              {weather.title}
            </div>
            <div className="mt-1 flex gap-2 overflow-x-auto text-center">
              {weather.days.map((d) => (
                <div key={d.date} className="min-w-10 shrink-0">
                  <div className="text-[9px] text-neutral-500">{d.label}</div>
                  <div className="text-sm leading-none">{wmoEmoji(d.code)}</div>
                  <div className="text-xs font-medium">{d.tMax}°</div>
                  <div className="text-[10px] text-neutral-500">{d.tMin}°</div>
                  {/* 💧 verduidelijkt dat het % de neerslagkans is (kale "0%"
                      was dubbelzinnig). */}
                  <div className="text-[9px] text-sky-600">💧{d.rain}%</div>
                </div>
              ))}
            </div>
            {weather.packTip && (
              <p className="mt-1 text-[10px] text-neutral-500">{weather.packTip}</p>
            )}
          </div>
        )}

        {related && related.tours.length > 0 && (
          <div>
            <div className="text-xs font-medium text-neutral-700">
              {related.toursTitle}
            </div>
            <div className="mt-1 flex flex-col gap-1">
              {related.tours.map((tr) => (
                <a
                  key={tr.href}
                  href={tr.href}
                  className="flex items-center gap-2 rounded-lg bg-neutral-50 px-2 py-1.5 hover:bg-neutral-100"
                >
                  {tr.coords && tr.coords.length > 1 && (
                    <div className="h-9 w-12 shrink-0 overflow-hidden rounded bg-white">
                      <MiniMap coords={tr.coords} className="h-full w-full" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="truncate text-xs font-medium text-neutral-800">
                      {tr.name}
                    </div>
                    <div className="text-[10px] text-neutral-500">{tr.meta}</div>
                  </div>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* GEN-117: highlights the track actually passes, with km markers */}
        {related && related.passed && related.passed.length > 0 && (
          <div>
            <div className="text-xs font-medium text-neutral-700">
              {related.passedTitle}
            </div>
            <div className="mt-1 flex flex-col gap-0.5">
              {related.passed.map((hl) => (
                <a
                  key={hl.href}
                  href={hl.href}
                  className="rounded px-1 py-1 text-xs text-neutral-700 hover:text-emerald-800"
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0 truncate">{hl.name}</span>
                    <span className="shrink-0 text-[10px] text-neutral-500">
                      {hl.meta}
                    </span>
                  </span>
                  {hl.tipText && (
                    <span className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-neutral-500">
                      “{hl.tipText}”{" "}
                      <span className="text-neutral-400">— {hl.tipBy}</span>
                    </span>
                  )}
                </a>
              ))}
            </div>
          </div>
        )}

        {related && related.highlights.length > 0 && (
          <div>
            <div className="text-xs font-medium text-neutral-700">
              {related.highlightsTitle}
            </div>
            <div className="mt-1 flex flex-col gap-0.5">
              {related.highlights.map((hl) => (
                <a
                  key={hl.href}
                  href={hl.href}
                  className="flex items-baseline justify-between gap-2 rounded px-1 py-1 text-xs text-neutral-700 hover:text-emerald-800"
                >
                  <span className="min-w-0 truncate">{hl.name}</span>
                  <span className="shrink-0 text-[10px] text-neutral-500">
                    {hl.meta}
                  </span>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* GEN-118: likes + comments */}
        {social && (
          <div className="border-t border-neutral-100 pt-3">
            <TourSocial tourId={social.tourId} tourOwner={social.tourOwner} />
          </div>
        )}
      </div>
    </>
  );
}
