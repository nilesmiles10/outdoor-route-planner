"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseBrowser } from "@/lib/supabase/client";
import { CATEGORY_EMOJI } from "@/lib/highlights";
import SiteFooter from "@/components/SiteFooter";

type Row = {
  id: string;
  name: string;
  sport: string;
  stats: { distanceM: number; ascendM: number };
  waypoints: { lon: number; lat: number }[];
};

const SPORTS = ["all", "hike", "run", "touring", "gravel", "mtb", "road", "ebike"];
// Zoals /api/discover/combos ze levert: al gesorteerd op aantal, slug klaar.
type Combo = { slug: string; label: string; category: string; n: number };
// 3.614 combo's halen de ≥8-poort — als chiprij onbruikbaar. De rijkste eerst;
// de rest blijft bereikbaar via de sitemap en de links op de regiopagina's.
const MAX_CHIPS = 60;
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
  // Tot de eerste routes-fetch klaar is: anders toonde de lege lijst de
  // "geen routes gevonden"-tekst (misleidend — ze laden nog).
  const [loading, setLoading] = useState(true);
  const [featured, setFeatured] = useState<Row[]>([]);
  // GEN-145: officiële routes (OSM-import) — kleine rail met doorlink.
  const [trails, setTrails] = useState<
    { id: string; name: string; sport: string; region: string | null; stats: { distanceM: number; ascendM: number } }[]
  >([]);
  const [sport, setSport] = useState("all");
  const [band, setBand] = useState("all");
  const [pos, setPos] = useState<[number, number] | null>(null);
  // GEN-116: region × category combos with enough content for a page.
  const [combos, setCombos] = useState<Combo[]>([]);

  useEffect(() => {
    sb.from("tours")
      .select("id,name,sport,stats,waypoints")
      .eq("visibility", "public")
      .eq("kind", "planned")
      .limit(100)
      .then(({ data }) => {
        setRows((data as Row[]) ?? []);
        setLoading(false);
      });
    // Fase C admin-curatie: uitgelichte routes bovenaan als aparte rail.
    sb.from("tours")
      .select("id,name,sport,stats,waypoints")
      .eq("visibility", "public")
      .not("featured_at", "is", null)
      .order("featured_at", { ascending: false })
      .limit(10)
      .then(({ data }) => setFeatured((data as Row[]) ?? []));
    sb.from("trails")
      .select("id,name,sport,region,stats")
      .limit(10)
      .then(({ data }) => setTrails((data as typeof trails) ?? []));
    // Tellen over `highlights` zelf ging mis: .limit(2000) leverde door de
    // PostgREST max-rows-cap 1000 willekeurige rijen van 500k, dus de counts
    // klopten niet én het gros van Europa ontbrak (14 regio's van 1.150).
    // De aggregatie zit nu achter een uur-gecachete route — zie de comment
    // daar voor waarom dit niet rechtstreeks vanuit de browser kan.
    fetch("/api/discover/combos")
      .then((r) => (r.ok ? r.json() : []))
      .then((c: Combo[]) => setCombos(c))
      .catch(() => {});
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

      {featured.length > 0 && (
        <section className="mt-4">
          <h2 className="mb-2 text-sm font-semibold text-neutral-700">
            ★ {t("featured")}
          </h2>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {featured.map((r) => (
              <a
                key={r.id}
                href={`/${locale}/tour/${r.id}`}
                className="w-56 shrink-0 rounded-xl border border-amber-200 bg-amber-50/50 px-4 py-3 hover:border-amber-300"
              >
                <div className="truncate text-sm font-medium text-neutral-900">{r.name}</div>
                <div className="mt-0.5 text-xs text-neutral-500">
                  {(r.stats.distanceM / 1000).toFixed(1)} km · ↗ {r.stats.ascendM} m · {ts(r.sport as never)}
                </div>
              </a>
            ))}
          </div>
        </section>
      )}

      {trails.length > 0 && (
        <section className="mt-4">
          <h2 className="mb-2 flex items-baseline justify-between text-sm font-semibold text-neutral-700">
            <span>✓ {t("trailsTitle")}</span>
            <a href={`/${locale}/trails`} className="text-xs font-normal text-emerald-700 hover:underline">
              {t("trailsMore")}
            </a>
          </h2>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {trails.map((r) => (
              <a
                key={r.id}
                href={`/${locale}/trail/${r.id}`}
                className="w-56 shrink-0 rounded-xl border border-emerald-200 bg-emerald-50/50 px-4 py-3 hover:border-emerald-300"
              >
                <div className="truncate text-sm font-medium text-neutral-900">{r.name}</div>
                <div className="mt-0.5 text-xs text-neutral-500">
                  {(r.stats.distanceM / 1000).toFixed(1)} km · ↗ {r.stats.ascendM} m · {ts(r.sport as never)}
                  {r.region ? ` · ${r.region}` : ""}
                </div>
              </a>
            ))}
          </div>
        </section>
      )}

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
        {loading &&
          Array.from({ length: 6 }).map((_, i) => (
            <div
              key={`sk${i}`}
              className="animate-pulse rounded-2xl border border-neutral-100 bg-white p-4"
            >
              <div className="h-4 w-2/3 rounded bg-neutral-200" />
              <div className="mt-2 h-3 w-1/3 rounded bg-neutral-100" />
            </div>
          ))}
        {!loading && filtered.length === 0 && (
          <div className="col-span-full flex flex-col items-start gap-2">
            <p className="text-sm text-neutral-400">{t("empty")}</p>
            {/* Reset-knop alleen tonen als er daadwerkelijk een filter actief
                is — anders helpt wissen niet en is de knop misleidend. */}
            {(sport !== "all" || band !== "all") && (
              <button
                type="button"
                onClick={() => {
                  setSport("all");
                  setBand("all");
                }}
                className="text-sm font-medium text-emerald-700 hover:underline"
              >
                {t("clearFilters")}
              </button>
            )}
          </div>
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
            {combos.slice(0, MAX_CHIPS).map((c) => (
              <a
                key={`${c.slug}|${c.category}`}
                href={`/${locale}/discover/${c.slug}/${c.category}`}
                className="rounded-full border border-neutral-200 px-3 py-1 text-xs text-neutral-700 hover:border-emerald-400 hover:text-emerald-800"
              >
                {CATEGORY_EMOJI[c.category]} {tr(`catPlural.${c.category}` as never)}{" "}
                in {c.label}{" "}
                <span className="text-neutral-400">({c.n})</span>
              </a>
            ))}
          </div>
        </section>
      )}

      <SiteFooter />
    </main>
  );
}
