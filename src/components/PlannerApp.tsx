"use client";

import { useCallback, useEffect, useReducer, useState } from "react";
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

type Slots = (Waypoint | null)[];
type PlanState = { slots: Slots; past: Slots[]; future: Slots[] };
type PlanAction =
  | { type: "set"; index: number; wp: Waypoint | null }
  | { type: "insert"; index: number; wp: Waypoint }
  | { type: "append" }
  | { type: "remove"; index: number }
  | { type: "reverse" }
  | { type: "undo" }
  | { type: "redo" };

function planReducer(state: PlanState, action: PlanAction): PlanState {
  const commit = (slots: Slots): PlanState => ({
    slots,
    past: [...state.past.slice(-49), state.slots],
    future: [],
  });
  switch (action.type) {
    case "set": {
      const slots = [...state.slots];
      slots[action.index] = action.wp;
      return commit(slots);
    }
    case "insert": {
      const slots = [...state.slots];
      slots.splice(action.index, 0, action.wp);
      return commit(slots);
    }
    case "append":
      return commit([...state.slots, null]);
    case "remove": {
      let slots = state.slots.filter((_, i) => i !== action.index);
      while (slots.length < 2) slots = [...slots, null];
      return commit(slots);
    }
    case "reverse":
      return commit([...state.slots].reverse());
    case "undo": {
      const prev = state.past[state.past.length - 1];
      if (!prev) return state;
      return {
        slots: prev,
        past: state.past.slice(0, -1),
        future: [state.slots, ...state.future].slice(0, 50),
      };
    }
    case "redo": {
      const next = state.future[0];
      if (!next) return state;
      return {
        slots: next,
        past: [...state.past.slice(-49), state.slots],
        future: state.future.slice(1),
      };
    }
  }
}

function fmtKm(m: number) {
  return (m / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 });
}
function fmtTime(s: number) {
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return `${h}:${String(m).padStart(2, "0")}`;
}

async function reverseName(lon: number, lat: number): Promise<string> {
  try {
    const res = await fetch(`/api/geo/reverse?lon=${lon}&lat=${lat}`);
    const data = await res.json();
    if (data.name) return data.name;
  } catch {
    // fall through
  }
  return `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
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
  const [plan, dispatch] = useReducer(planReducer, {
    slots: [null, null],
    past: [],
    future: [],
  });
  const [sport, setSport] = useState<Sport>("touring");
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filled = plan.slots.filter((s): s is Waypoint => s !== null);

  // Route fetch — reacts to waypoints + sport
  const fetchRoute = useCallback(async () => {
    if (filled.length < 2) {
      setRoute(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const points = filled.map((w) => `${w.lon},${w.lat}`).join("|");
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(filled), sport]);

  useEffect(() => {
    fetchRoute();
  }, [fetchRoute]);

  // Keyboard undo/redo
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        dispatch({ type: e.shiftKey ? "redo" : "undo" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Map click → fill first empty slot, else append at the end
  const handleMapClick = useCallback(
    async (lon: number, lat: number) => {
      const name = await reverseName(lon, lat);
      const wp = { name, lon, lat };
      const firstEmpty = plan.slots.findIndex((s) => s === null);
      if (firstEmpty >= 0) dispatch({ type: "set", index: firstEmpty, wp });
      else dispatch({ type: "insert", index: plan.slots.length, wp });
    },
    [plan.slots],
  );

  // Marker drag → move that waypoint
  const handleMarkerDragEnd = useCallback(
    async (slotIndex: number, lon: number, lat: number) => {
      const name = await reverseName(lon, lat);
      dispatch({ type: "set", index: slotIndex, wp: { name, lon, lat } });
    },
    [],
  );

  // Route-line drop → insert a via between the bracketing waypoints
  const handleRouteDrop = useCallback(
    async (lon: number, lat: number) => {
      if (!route || filled.length < 2) return;
      const coords = (route.geometry.geometry as GeoJSON.LineString).coordinates;
      const nearestIdx = (pLon: number, pLat: number) => {
        let best = 0;
        let bestD = Infinity;
        for (let i = 0; i < coords.length; i++) {
          const dx = coords[i][0] - pLon;
          const dy = coords[i][1] - pLat;
          const d = dx * dx + dy * dy;
          if (d < bestD) {
            bestD = d;
            best = i;
          }
        }
        return best;
      };
      const dropIdx = nearestIdx(lon, lat);
      // Find the first waypoint (in route order) that lies beyond the drop.
      let insertBeforeOrder = filled.length - 1;
      for (let o = 1; o < filled.length; o++) {
        if (nearestIdx(filled[o].lon, filled[o].lat) >= dropIdx) {
          insertBeforeOrder = o;
          break;
        }
      }
      // Map order-index back to slot-index
      let seen = -1;
      let slotIndex = plan.slots.length;
      for (let i = 0; i < plan.slots.length; i++) {
        if (plan.slots[i] !== null) {
          seen++;
          if (seen === insertBeforeOrder) {
            slotIndex = i;
            break;
          }
        }
      }
      const name = await reverseName(lon, lat);
      dispatch({ type: "insert", index: slotIndex, wp: { name, lon, lat } });
    },
    [route, filled, plan.slots],
  );

  const buckets = route?.surfaces.buckets;
  const totalSurface = buckets
    ? buckets.paved + buckets.unpaved + buckets.unknown
    : 0;

  return (
    <main className="relative h-dvh w-full">
      <MapView
        route={route?.geometry ?? null}
        waypoints={plan.slots}
        onMapClick={handleMapClick}
        onMarkerDragEnd={handleMarkerDragEnd}
        onRouteDrop={handleRouteDrop}
      />

      <div className="absolute left-4 top-4 flex w-[340px] max-h-[calc(100dvh-2rem)] flex-col gap-3 overflow-y-auto rounded-2xl bg-white/95 p-4 shadow-xl backdrop-blur">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-lg font-semibold text-neutral-900">
              {t("title")}
            </h1>
            <p className="text-xs text-neutral-500">{t("tagline")}</p>
          </div>
          <div className="flex gap-1">
            <button
              type="button"
              title={t("undo")}
              onClick={() => dispatch({ type: "undo" })}
              disabled={plan.past.length === 0}
              className="rounded-lg bg-neutral-100 px-2 py-1 text-sm hover:bg-neutral-200 disabled:opacity-30"
            >
              ↶
            </button>
            <button
              type="button"
              title={t("redo")}
              onClick={() => dispatch({ type: "redo" })}
              disabled={plan.future.length === 0}
              className="rounded-lg bg-neutral-100 px-2 py-1 text-sm hover:bg-neutral-200 disabled:opacity-30"
            >
              ↷
            </button>
          </div>
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
          {plan.slots.map((slot, i) => (
            <SearchField
              key={i}
              placeholder={
                i === 0
                  ? t("start")
                  : i === plan.slots.length - 1
                    ? t("destination")
                    : t("via")
              }
              badge={String.fromCharCode(65 + i)}
              badgeColor={
                i === 0 ? "#16a34a" : i === plan.slots.length - 1 ? "#dc2626" : "#2563eb"
              }
              value={slot}
              onSelect={(wp) => dispatch({ type: "set", index: i, wp })}
              onRemove={
                plan.slots.length > 2
                  ? () => dispatch({ type: "remove", index: i })
                  : undefined
              }
            />
          ))}
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => dispatch({ type: "append" })}
              disabled={plan.slots.length >= 10}
              className="text-xs text-emerald-700 hover:underline disabled:text-neutral-300"
            >
              + {t("addWaypoint")}
            </button>
            <button
              type="button"
              onClick={() => dispatch({ type: "reverse" })}
              disabled={filled.length < 2}
              className="text-xs text-emerald-700 hover:underline disabled:text-neutral-300"
            >
              ⇅ {t("reverse")}
            </button>
          </div>
          <p className="text-[11px] text-neutral-400">{t("mapHint")}</p>
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
                    ■ {t("unpaved")}{" "}
                    {Math.round((buckets.unpaved / totalSurface) * 100)}%
                  </span>
                  <span>
                    ■ {t("unknown")}{" "}
                    {Math.round((buckets.unknown / totalSurface) * 100)}%
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
