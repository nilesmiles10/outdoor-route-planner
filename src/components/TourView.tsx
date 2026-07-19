"use client";

import { useMemo, useState } from "react";
import MapView, { type Waypoint } from "./MapView";
import ElevationChart from "./ElevationChart";
import { cumulativeDistances, detectClimbs } from "@/lib/elevation";
import { buildGpx } from "@/lib/gpx";

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
  };
};

const noop = () => {};

export default function TourView({ geometry, elevation, waypoints, header }: Props) {
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
  const total = header.buckets.paved + header.buckets.unpaved + header.buckets.unknown;
  const plannerHref = `/?w=${waypoints
    .map((p) => `${p.lon.toFixed(5)},${p.lat.toFixed(5)}`)
    .join(";")}&sport=${header.sport}`;

  function downloadGpx() {
    const gpx = buildGpx(header.name, geometry.coordinates, elevation, waypoints);
    const blob = new Blob([gpx], { type: "application/gpx+xml" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${header.name.replace(/[^\w\- ]+/g, "").slice(0, 60) || "route"}.gpx`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

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
      <div className="absolute left-4 top-16 flex w-[340px] max-h-[calc(100dvh-5rem)] flex-col gap-3 overflow-y-auto rounded-2xl bg-white/95 p-4 shadow-xl backdrop-blur">
        <div>
          <h1 className="text-lg font-semibold text-neutral-900">{header.name}</h1>
          <p className="text-xs capitalize text-neutral-500">{header.sport}</p>
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
          <button
            type="button"
            onClick={downloadGpx}
            className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-800"
          >
            ⤓ {header.gpxLabel}
          </button>
          <a
            href={plannerHref}
            className="rounded-lg bg-neutral-100 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-200"
          >
            {header.planLabel}
          </a>
        </div>
      </div>
    </>
  );
}
