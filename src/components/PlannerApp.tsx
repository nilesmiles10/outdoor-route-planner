"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import MapView, { type Waypoint } from "./MapView";
import SearchField from "./SearchField";

const SPORTS = ["hike", "run", "touring", "gravel", "mtb", "road", "ebike"] as const;
type Sport = (typeof SPORTS)[number];

type RouteResult = {
  geometry: GeoJSON.Feature;
  stats: { distanceM: number; timeS: number; ascendM: number; descendM: number };
  surfaces: { buckets: { paved: number; unpaved: number; unknown: number } };
  waytypes: Record<string, number>;
  elevation: number[];
};

function fmtKm(m: number) {
  return (m / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 });
}
function fmtTime(s: number) {
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return `${h}:${String(m).padStart(2, "0")}`;
}

function ElevationSparkline({ elevation }: { elevation: number[] }) {
  if (elevation.length < 2) return null;
  const w = 300;
  const h = 60;
  const min = Math.min(...elevation);
  const max = Math.max(...elevation);
  const range = Math.max(max - min, 10);
  const pts = elevation
    .map((e, i) => {
      const x = (i / (elevation.length - 1)) * w;
      const y = h - ((e - min) / range) * (h - 8) - 4;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img">
      <polyline
        points={`0,${h} ${pts} ${w},${h}`}
        fill="rgb(37 99 235 / 0.15)"
        stroke="none"
      />
      <polyline points={pts} fill="none" stroke="#2563eb" strokeWidth="1.5" />
      <text x="2" y="10" className="fill-neutral-500" fontSize="9">
        {Math.round(max)} m
      </text>
      <text x="2" y={h - 2} className="fill-neutral-500" fontSize="9">
        {Math.round(min)} m
      </text>
    </svg>
  );
}

export default function PlannerApp() {
  const t = useTranslations("planner");
  const [a, setA] = useState<Waypoint | null>(null);
  const [b, setB] = useState<Waypoint | null>(null);
  const [sport, setSport] = useState<Sport>("touring");
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRoute = useCallback(async () => {
    if (!a || !b) {
      setRoute(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const points = `${a.lon},${a.lat}|${b.lon},${b.lat}`;
      const res = await fetch(
        `/api/geo/route?points=${encodeURIComponent(points)}&sport=${sport}`,
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "error");
      }
      setRoute(await res.json());
    } catch (e) {
      setRoute(null);
      setError(e instanceof Error ? e.message : "error");
    } finally {
      setLoading(false);
    }
  }, [a, b, sport]);

  useEffect(() => {
    fetchRoute();
  }, [fetchRoute]);

  const buckets = route?.surfaces.buckets;
  const totalSurface = buckets
    ? buckets.paved + buckets.unpaved + buckets.unknown
    : 0;

  return (
    <main className="relative h-dvh w-full">
      <MapView route={route?.geometry ?? null} a={a} b={b} />

      <div className="absolute left-4 top-4 flex w-[340px] max-h-[calc(100dvh-2rem)] flex-col gap-3 overflow-y-auto rounded-2xl bg-white/95 p-4 shadow-xl backdrop-blur">
        <div>
          <h1 className="text-lg font-semibold text-neutral-900">{t("title")}</h1>
          <p className="text-xs text-neutral-500">{t("tagline")}</p>
        </div>

        <div className="flex flex-wrap gap-1">
          {SPORTS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSport(s)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                sport === s
                  ? "bg-emerald-700 text-white"
                  : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
              }`}
            >
              {t(`sports.${s}`)}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-2">
          <SearchField
            placeholder={t("start")}
            badge="A"
            badgeColor="#16a34a"
            value={a}
            onSelect={setA}
          />
          <SearchField
            placeholder={t("destination")}
            badge="B"
            badgeColor="#dc2626"
            value={b}
            onSelect={setB}
          />
          <button
            type="button"
            onClick={() => {
              setA(b);
              setB(a);
            }}
            disabled={!a && !b}
            className="self-start text-xs text-emerald-700 hover:underline disabled:text-neutral-300"
          >
            ⇅ {t("reverse")}
          </button>
        </div>

        {loading && (
          <p className="text-sm text-neutral-500">{t("calculating")}</p>
        )}
        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {["no_route", "router_unavailable"].includes(error)
              ? t(`errors.${error}` as "errors.no_route" | "errors.router_unavailable")
              : t("errors.generic")}
          </p>
        )}

        {route && !loading && (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-4 gap-2 text-center">
              <div>
                <div className="text-base font-semibold">
                  {fmtKm(route.stats.distanceM)}
                </div>
                <div className="text-[10px] uppercase text-neutral-500">km</div>
              </div>
              <div>
                <div className="text-base font-semibold">
                  {fmtTime(route.stats.timeS)}
                </div>
                <div className="text-[10px] uppercase text-neutral-500">
                  {t("time")}
                </div>
              </div>
              <div>
                <div className="text-base font-semibold">
                  ↗ {route.stats.ascendM}
                </div>
                <div className="text-[10px] uppercase text-neutral-500">m</div>
              </div>
              <div>
                <div className="text-base font-semibold">
                  ↘ {route.stats.descendM}
                </div>
                <div className="text-[10px] uppercase text-neutral-500">m</div>
              </div>
            </div>

            <ElevationSparkline elevation={route.elevation} />

            {buckets && totalSurface > 0 && (
              <div>
                <div className="mb-1 text-xs font-medium text-neutral-700">
                  {t("surfaces")}
                </div>
                <div className="flex h-2 w-full overflow-hidden rounded-full">
                  <div
                    className="bg-blue-600"
                    style={{ width: `${(buckets.paved / totalSurface) * 100}%` }}
                  />
                  <div
                    className="bg-amber-500"
                    style={{ width: `${(buckets.unpaved / totalSurface) * 100}%` }}
                  />
                  <div
                    className="bg-neutral-300"
                    style={{ width: `${(buckets.unknown / totalSurface) * 100}%` }}
                  />
                </div>
                <div className="mt-1 flex gap-3 text-[11px] text-neutral-600">
                  <span>
                    ■ {t("paved")} {Math.round((buckets.paved / totalSurface) * 100)}%
                  </span>
                  <span>
                    ■ {t("unpaved")} {Math.round((buckets.unpaved / totalSurface) * 100)}%
                  </span>
                  <span>
                    ■ {t("unknown")} {Math.round((buckets.unknown / totalSurface) * 100)}%
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
