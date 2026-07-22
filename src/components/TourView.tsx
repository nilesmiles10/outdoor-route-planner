"use client";

import { useMemo, useState } from "react";
import MapView, { type Waypoint } from "./MapView";
import ElevationChart from "./ElevationChart";
import SpeedChart from "./SpeedChart";
import TourSocial from "./TourSocial";
import Avatar from "./Avatar";
import { cumulativeDistances, detectClimbs } from "@/lib/elevation";
import { speedSeries, fmtDuration } from "@/lib/activity";
import ExportMenu from "./ExportMenu";
import type { CourseTurn } from "@/lib/course";

type Props = {
  geometry: GeoJSON.LineString;
  elevation: number[];
  waypoints: Waypoint[];
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
  // Tour page v2 (GEN-132): all strings pre-translated server-side.
  autoDesc?: string;
  weather?: {
    title: string;
    days: { date: string; label: string; tMax: number; tMin: number; rain: number }[];
    packTip: string | null;
  } | null;
  related?: {
    toursTitle: string;
    tours: { href: string; name: string; meta: string }[];
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

export default function TourView({
  geometry,
  elevation,
  waypoints,
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
  source,
}: Props) {
  const [embedCopied, setEmbedCopied] = useState(false);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const feature: GeoJSON.Feature = useMemo(
    () => ({ type: "Feature", properties: {}, geometry }),
    [geometry],
  );
  const distances = useMemo(
    () => cumulativeDistances(geometry.coordinates),
    [geometry],
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
  const plannerHref = `/?w=${waypoints
    .map((p) => `${p.lon.toFixed(5)},${p.lat.toFixed(5)}`)
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

  return (
    <>
      <MapView
        route={feature}
        waypoints={waypoints}
        hoverPoint={hoverIdx !== null ? geometry.coordinates[hoverIdx] ?? null : null}
        onMapClick={noop}
        onMarkerDragEnd={noop}
        onRouteDrop={noop}
      />
      <div className="absolute flex flex-col gap-3 overflow-y-auto rounded-2xl bg-white/95 p-4 shadow-xl backdrop-blur max-md:inset-x-2 max-md:bottom-2 max-md:max-h-[45dvh] md:left-4 md:top-16 md:max-h-[calc(100dvh-5rem)] md:w-[340px]">
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
          <p className="text-xs capitalize text-neutral-500">
            {header.sport}
            {activity && (
              <span className="normal-case"> · 🏁 {activity.recordedLabel}</span>
            )}
          </p>
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
        />
        {total > 0 && (
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
        )}
        <div className="flex gap-2">
          <ExportMenu getData={exportData} />
          <a
            href={plannerHref}
            className="rounded-lg bg-neutral-100 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-200"
          >
            {header.planLabel}
          </a>
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
                  <div className="text-xs font-medium">{d.tMax}°</div>
                  <div className="text-[10px] text-neutral-500">{d.tMin}°</div>
                  <div className="text-[9px] text-sky-600">{d.rain}%</div>
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
                  className="rounded-lg bg-neutral-50 px-2 py-1.5 hover:bg-neutral-100"
                >
                  <div className="truncate text-xs font-medium text-neutral-800">
                    {tr.name}
                  </div>
                  <div className="text-[10px] text-neutral-500">{tr.meta}</div>
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
