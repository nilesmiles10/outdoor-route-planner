"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { supabaseBrowser } from "@/lib/supabase/client";
import { buildGpx } from "@/lib/gpx";
import { difficulty } from "@/lib/difficulty";
import AccountPanel from "@/components/AccountPanel";
import UploadActivity from "@/components/UploadActivity";
import SiteFooter from "@/components/SiteFooter";
import VisibilitySelect from "@/components/VisibilitySelect";
import type { Visibility } from "@/lib/visibility";

type Row = {
  id: string;
  name: string;
  sport: string;
  visibility: Visibility;
  kind: "planned" | "completed";
  recorded_at: string | null;
  moving_s: number | null;
  stats: { distanceM: number; timeS: number; ascendM: number };
  waypoints: { name: string; lon: number; lat: number }[];
  custom_speed_kmh: number | null;
  updated_at: string;
};

const SPORTS = ["all", "hike", "run", "touring", "gravel", "mtb", "road", "ebike"];
const BANDS: [string, number, number][] = [
  ["all", 0, Infinity],
  ["short", 0, 20000],
  ["mid", 20000, 50000],
  ["long", 50000, Infinity],
];

function fmtTime(s: number) {
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return `${h}:${String(m).padStart(2, "0")}`;
}

// Effective duration: custom pace overrides the router's estimate (GEN-130).
function effectiveTimeS(row: Row): number {
  if (row.custom_speed_kmh && row.custom_speed_kmh > 0) {
    return (row.stats.distanceM / 1000 / row.custom_speed_kmh) * 3600;
  }
  return row.stats.timeS;
}

const DIFF_COLORS: Record<string, string> = {
  easy: "bg-emerald-100 text-emerald-800",
  moderate: "bg-amber-100 text-amber-800",
  hard: "bg-red-100 text-red-800",
};

export default function RoutesPage() {
  const t = useTranslations("routesPage");
  const tp = useTranslations("planner");
  const locale = useLocale();
  const sb: SupabaseClient = useMemo(() => supabaseBrowser(), []);
  const [user, setUser] = useState<User | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [filter, setFilter] = useState("");
  const [sport, setSport] = useState("all");
  const [band, setBand] = useState("all");
  const [kind, setKind] = useState<"all" | "planned" | "completed">("all");
  const [paceEdit, setPaceEdit] = useState<string | null>(null); // row id

  useEffect(() => {
    sb.auth.getUser().then(({ data }) => setUser(data.user));
    const { data: sub } = sb.auth.onAuthStateChange((_e, s) =>
      setUser(s?.user ?? null),
    );
    return () => sub.subscription.unsubscribe();
  }, [sb]);

  const refresh = useCallback(async () => {
    const { data } = await sb
      .from("tours")
      .select(
        "id,name,sport,visibility,kind,recorded_at,moving_s,stats,waypoints,custom_speed_kmh,updated_at",
      )
      .order("updated_at", { ascending: false })
      .limit(100);
    setRows((data as Row[]) ?? []);
  }, [sb]);

  useEffect(() => {
    if (user) refresh();
  }, [user, refresh]);

  async function download(row: Row) {
    const { data } = await sb
      .from("tours")
      .select("geometry,elevation")
      .eq("id", row.id)
      .single();
    if (!data) return;
    const gpx = buildGpx(
      row.name,
      (data.geometry as GeoJSON.LineString).coordinates,
      data.elevation as number[],
      row.waypoints,
    );
    const blob = new Blob([gpx], { type: "application/gpx+xml" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${row.name.replace(/[^\w\- ]+/g, "").slice(0, 60) || "route"}.gpx`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function savePace(row: Row, value: string) {
    const v = Number(value.replace(",", "."));
    const speed = Number.isFinite(v) && v > 0 && v < 100 ? v : null;
    await sb.from("tours").update({ custom_speed_kmh: speed }).eq("id", row.id);
    setPaceEdit(null);
    refresh();
  }

  const [, lo, hi] = BANDS.find(([k]) => k === band)!;
  const filtered = rows
    .filter((r) => r.name.toLowerCase().includes(filter.toLowerCase()))
    .filter((r) => sport === "all" || r.sport === sport)
    .filter((r) => kind === "all" || (r.kind ?? "planned") === kind)
    .filter((r) => r.stats.distanceM >= lo && r.stats.distanceM < hi);

  return (
    <main className="mx-auto min-h-dvh max-w-3xl px-4 pb-16 pt-20">
      <div className="flex items-start justify-between gap-3">
        <h1 className="text-xl font-semibold text-neutral-900">{t("title")}</h1>
        {user && (
          <a
            href={`/${locale}`}
            className="shrink-0 text-xs text-emerald-700 hover:underline"
          >
            ⤒ {t("importCta")}
          </a>
        )}
      </div>
      {!user ? (
        <div className="mt-6 max-w-sm">
          <p className="mb-3 text-sm text-neutral-600">{t("needLogin")}</p>
          <AccountPanel tour={null} onLoadTour={() => {}} />
        </div>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={t("searchPlaceholder")}
              className="w-full max-w-sm rounded-lg border border-neutral-200 px-3 py-2 text-sm"
            />
            {/* GEN-117: recorded GPX/FIT upload → completed activity */}
            <UploadActivity sb={sb} user={user} />
          </div>
          <div className="mt-3 flex flex-wrap gap-1">
            {(["all", "planned", "completed"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  kind === k
                    ? "bg-sky-700 text-white"
                    : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
                }`}
              >
                {t(`kinds.${k}` as never)}
              </button>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {SPORTS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSport(s)}
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  sport === s
                    ? "bg-emerald-700 text-white"
                    : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
                }`}
              >
                {s === "all" ? t("allSports") : tp(`sports.${s}` as never)}
              </button>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {BANDS.map(([k]) => (
              <button
                key={k}
                type="button"
                onClick={() => setBand(k)}
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  band === k
                    ? "bg-neutral-800 text-white"
                    : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
                }`}
              >
                {t(`bands.${k}` as never)}
              </button>
            ))}
          </div>

          <div className="mt-4 flex flex-col gap-2">
            {filtered.length === 0 && (
              <p className="text-sm text-neutral-400">{t("empty")}</p>
            )}
            {filtered.map((row) => {
              const plannerHref = `/${locale}?w=${row.waypoints
                .map((p) => `${p.lon.toFixed(5)},${p.lat.toFixed(5)}`)
                .join(";")}&sport=${row.sport}`;
              const diff = difficulty(
                row.sport,
                row.stats.distanceM,
                row.stats.ascendM,
              );
              const timeS = effectiveTimeS(row);
              const defaultSpeed =
                row.stats.timeS > 0
                  ? row.stats.distanceM / 1000 / (row.stats.timeS / 3600)
                  : 0;
              const completed = row.kind === "completed";
              return (
                <div
                  key={row.id}
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-neutral-100 bg-white px-4 py-3 shadow-sm"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                          completed
                            ? "bg-sky-100 text-sky-800"
                            : DIFF_COLORS[diff]
                        }`}
                      >
                        {completed
                          ? `🏁 ${t("kinds.completed")}`
                          : tp(`difficultyLabels.${diff}` as never)}
                      </span>
                      <span className="truncate font-medium text-neutral-900">
                        {row.name}
                      </span>
                    </div>
                    <div className="mt-0.5 text-xs text-neutral-500">
                      {(row.stats.distanceM / 1000).toFixed(1)} km ·{" "}
                      {fmtTime(completed ? (row.moving_s ?? timeS) : timeS)} · ↗{" "}
                      {row.stats.ascendM} m ·{" "}
                      <span className="capitalize">
                        {tp(`sports.${row.sport}` as never)}
                      </span>{" "}
                      ·{" "}
                      {new Date(
                        completed && row.recorded_at
                          ? row.recorded_at
                          : row.updated_at,
                      ).toLocaleDateString(locale)}
                    </div>
                    {/* Custom pace (GEN-130): overrides the estimated duration */}
                    <div
                      className={`mt-1 text-[11px] text-neutral-400 ${completed ? "hidden" : ""}`}
                    >
                      {paceEdit === row.id ? (
                        <span className="flex items-center gap-1">
                          {t("pace")}:
                          <input
                            autoFocus
                            defaultValue={
                              row.custom_speed_kmh ?? defaultSpeed.toFixed(1)
                            }
                            onBlur={(e) => savePace(row, e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter")
                                savePace(row, (e.target as HTMLInputElement).value);
                              if (e.key === "Escape") setPaceEdit(null);
                            }}
                            className="w-14 rounded border border-neutral-200 px-1 py-0.5 text-[11px]"
                          />
                          km/h
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setPaceEdit(row.id)}
                          className="hover:text-emerald-700"
                          title={t("paceHint")}
                        >
                          {t("pace")}:{" "}
                          {row.custom_speed_kmh
                            ? `${row.custom_speed_kmh} km/h ✎`
                            : `${defaultSpeed.toFixed(1)} km/h ✎`}
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <a href={plannerHref} className="text-emerald-700 hover:underline">
                      {t("openPlanner")}
                    </a>
                    {/* The tour page is session-aware, so owners can open
                        their private rows too (needed for activity detail). */}
                    <a
                      href={`/${locale}/tour/${row.id}`}
                      className="text-emerald-700 hover:underline"
                    >
                      {t("view")}
                    </a>
                    <button
                      type="button"
                      onClick={() => download(row)}
                      className="rounded-lg bg-neutral-100 px-2 py-1 hover:bg-neutral-200"
                    >
                      ⤓ GPX
                    </button>
                    <VisibilitySelect
                      compact
                      value={row.visibility}
                      onChange={async (v) => {
                        await sb
                          .from("tours")
                          .update({ visibility: v })
                          .eq("id", row.id);
                        refresh();
                      }}
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        await sb.from("tours").delete().eq("id", row.id);
                        refresh();
                      }}
                      className="text-neutral-300 hover:text-red-600"
                    >
                      ×
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
      <SiteFooter />
    </main>
  );
}
