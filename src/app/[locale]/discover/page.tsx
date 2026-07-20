"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseBrowser } from "@/lib/supabase/client";
import { CATEGORY_EMOJI } from "@/lib/highlights";
import { slugify } from "@/lib/slug";

type Row = {
  id: string;
  name: string;
  sport: string;
  stats: { distanceM: number; ascendM: number };
  waypoints: { lon: number; lat: number }[];
};

const SPORTS = ["all", "hike", "run", "touring", "gravel", "mtb", "road", "ebike"];
const BANDS: [string, number, number][] = [
  ["all", 0, Infinity],
  ["short", 0, 20000],
  ["mid", 20000, 50000],
  ["long", 50000, Infinity],
];

function haversineKm(a: [number, number], b: [number, number]) {
  const R = 6371;
  const dLat = ((b[1] - a[1]) * Math.PI) / 180;
  const dLon = ((b[0] - a[0]) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a[1] * Math.PI) / 180) *
      Math.cos((b[1] * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export default function DiscoverPage() {
  const t = useTranslations("discover");
  const ts = useTranslations("planner.sports");
  const tr = useTranslations("regionPage");
  const locale = useLocale();
  const sb: SupabaseClient = useMemo(() => supabaseBrowser(), []);
  const [rows, setRows] = useState<Row[]>([]);
  const [sport, setSport] = useState("all");
  const [band, setBand] = useState("all");
  const [pos, setPos] = useState<[number, number] | null>(null);
  // GEN-116: region × category combos with enough content for a page.
  const [combos, setCombos] = useState<
    { region: string; category: string; count: number }[]
  >([]);

  useEffect(() => {
    sb.from("tours")
      .select("id,name,sport,stats,waypoints")
      .eq("visibility", "public")
      .eq("kind", "planned")
      .limit(100)
      .then(({ data }) => setRows((data as Row[]) ?? []));
    sb.from("highlights")
      .select("region,category")
      .not("region", "is", null)
      .limit(2000)
      .then(({ data }) => {
        const m = new Map<string, number>();
        for (const r of (data as { region: string; category: string }[]) ?? []) {
          const k = `${r.region}|${r.category}`;
          m.set(k, (m.get(k) ?? 0) + 1);
        }
        setCombos(
          Array.from(m.entries())
            .map(([k, count]) => {
              const [region, category] = k.split("|");
              return { region, category, count };
            })
            .filter((c) => c.count >= 8)
            .sort((a, b) => b.count - a.count),
        );
      });
    navigator.geolocation?.getCurrentPosition(
      (p) => setPos([p.coords.longitude, p.coords.latitude]),
      () => {},
      { timeout: 4000 },
    );
  }, [sb]);

  const [, lo, hi] = BANDS.find(([k]) => k === band)!;
  const filtered = rows
    .filter((r) => sport === "all" || r.sport === sport)
    .filter((r) => r.stats.distanceM >= lo && r.stats.distanceM < hi)
    .map((r) => ({
      ...r,
      distKm: pos && r.waypoints[0] ? haversineKm(pos, [r.waypoints[0].lon, r.waypoints[0].lat]) : null,
    }))
    .sort((a, b) => (a.distKm ?? 1e9) - (b.distKm ?? 1e9));

  return (
    <main className="mx-auto min-h-dvh max-w-4xl px-4 pb-16 pt-20">
      <h1 className="text-xl font-semibold text-neutral-900">{t("title")}</h1>
      <p className="mt-1 text-sm text-neutral-500">{t("subtitle")}</p>

      <div className="mt-4 flex flex-wrap gap-1">
        {SPORTS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSport(s)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              sport === s ? "bg-emerald-700 text-white" : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
            }`}
          >
            {s === "all" ? t("all") : ts(s as never)}
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
              band === k ? "bg-neutral-800 text-white" : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
            }`}
          >
            {t(`bands.${k}` as never)}
          </button>
        ))}
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {filtered.length === 0 && (
          <p className="text-sm text-neutral-400">{t("empty")}</p>
        )}
        {filtered.map((r) => (
          <a
            key={r.id}
            href={`/${locale}/tour/${r.id}`}
            className="rounded-xl border border-neutral-100 bg-white p-4 shadow-sm transition hover:shadow-md"
          >
            <div className="font-medium text-neutral-900">{r.name}</div>
            <div className="mt-1 text-xs text-neutral-500">
              {(r.stats.distanceM / 1000).toFixed(1)} km · ↗ {r.stats.ascendM} m ·{" "}
              <span className="capitalize">{ts(r.sport as never)}</span>
              {r.distKm !== null && (
                <span> · {Math.round(r.distKm)} km {t("away")}</span>
              )}
            </div>
          </a>
        ))}
      </div>

      {/* GEN-116: programmatic region pages */}
      {combos.length > 0 && (
        <section className="mt-10">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">
            {t("browseRegions")}
          </h2>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {combos.map((c) => (
              <a
                key={`${c.region}|${c.category}`}
                href={`/${locale}/discover/${slugify(c.region)}/${c.category}`}
                className="rounded-full border border-neutral-200 px-3 py-1 text-xs text-neutral-700 hover:border-emerald-400 hover:text-emerald-800"
              >
                {CATEGORY_EMOJI[c.category]} {tr(`catPlural.${c.category}` as never)}{" "}
                in {c.region}{" "}
                <span className="text-neutral-400">({c.count})</span>
              </a>
            ))}
          </div>
        </section>
      )}

      <footer className="mt-16 border-t border-neutral-100 pt-4 text-xs text-neutral-400">
        © {new Date().getFullYear()} Outdoor Route Planner ·{" "}
        <a href="https://www.openstreetmap.org/copyright" className="hover:underline">
          © OpenStreetMap contributors
        </a>
      </footer>
    </main>
  );
}
