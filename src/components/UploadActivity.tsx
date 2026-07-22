"use client";

// GEN-117 — upload a recorded GPX/FIT file as a completed activity.
// Parse happens fully client-side; the row lands in `tours` with
// kind='completed', visibility = de profiel-default (fallback private).

import { useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import {
  computeActivityStats,
  parseActivityFit,
  parseActivityGpx,
  type ParsedActivity,
} from "@/lib/activity";

const SPORTS = ["hike", "run", "touring", "gravel", "mtb", "road", "ebike"];

export default function UploadActivity({
  sb,
  user,
}: {
  sb: SupabaseClient;
  user: User;
}) {
  const t = useTranslations("activities");
  const tp = useTranslations("planner");
  const locale = useLocale();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [parsed, setParsed] = useState<ParsedActivity | null>(null);
  const [name, setName] = useState("");
  const [sport, setSport] = useState("touring");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFile(f: File) {
    setError(null);
    setBusy(true);
    try {
      let act: ParsedActivity | null = null;
      if (/\.fit$/i.test(f.name)) {
        act = await parseActivityFit(await f.arrayBuffer());
      } else {
        act = parseActivityGpx(await f.text());
      }
      if (!act) {
        setError(t("noTimestamps"));
        return;
      }
      setParsed(act);
      setName(
        act.name ??
          t("autoName", {
            date: new Date(act.startISO).toLocaleDateString(locale, {
              day: "numeric",
              month: "short",
            }),
          }),
      );
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function save() {
    if (!parsed) return;
    setBusy(true);
    setError(null);
    const stats = computeActivityStats(parsed);
    const first = parsed.coords[0];
    const last = parsed.coords[parsed.coords.length - 1];
    const { data: prof } = await sb
      .from("profiles")
      .select("default_tour_visibility")
      .eq("id", user.id)
      .maybeSingle();
    const { data, error: err } = await sb
      .from("tours")
      .insert({
        owner: user.id,
        name: name.trim() || t("autoName", { date: "" }).trim(),
        sport,
        visibility: prof?.default_tour_visibility ?? "private",
        kind: "completed",
        recorded_at: parsed.startISO,
        duration_s: stats.durationS,
        moving_s: stats.movingS,
        max_speed_kmh: stats.maxSpeedKmh,
        time_offsets: parsed.timeOffsets,
        waypoints: [
          { name: t("start"), lon: first[0], lat: first[1] },
          { name: t("finish"), lon: last[0], lat: last[1] },
        ],
        geometry: { type: "LineString", coordinates: parsed.coords },
        elevation: parsed.elevation,
        stats: {
          distanceM: stats.distanceM,
          timeS: stats.movingS,
          ascendM: parsed.hasElevation ? stats.ascendM : 0,
          descendM: parsed.hasElevation ? stats.descendM : 0,
        },
        surfaces: {
          buckets: { paved: 0, unpaved: 0, unknown: stats.distanceM },
          detailM: { unknown: stats.distanceM },
        },
        waytypes: {},
      })
      .select("id")
      .single();
    setBusy(false);
    if (err || !data) {
      setError(err?.message ?? "error");
      return;
    }
    router.push(`/${locale}/tour/${data.id}`);
  }

  return (
    <div>
      <input
        ref={fileRef}
        type="file"
        accept=".gpx,.fit"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
        }}
      />
      {!parsed ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
          className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
        >
          ⤒ {busy ? t("parsing") : t("upload")}
        </button>
      ) : (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/60 px-3 py-2">
          <span className="text-xs text-neutral-600">
            {(computeActivityStats(parsed).distanceM / 1000).toFixed(1)} km ·{" "}
            {new Date(parsed.startISO).toLocaleDateString(locale)}
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-44 rounded border border-neutral-200 px-2 py-1 text-xs"
          />
          <select
            value={sport}
            onChange={(e) => setSport(e.target.value)}
            className="rounded border border-neutral-200 px-1 py-1 text-xs"
          >
            {SPORTS.map((s) => (
              <option key={s} value={s}>
                {tp(`sports.${s}` as never)}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={busy}
            onClick={save}
            className="rounded-lg bg-emerald-700 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
          >
            {t("save")}
          </button>
          <button
            type="button"
            onClick={() => setParsed(null)}
            className="text-xs text-neutral-400 hover:text-neutral-600"
          >
            ✕
          </button>
        </div>
      )}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
