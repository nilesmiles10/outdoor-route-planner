"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseBrowser } from "@/lib/supabase/client";
import { CATEGORY_EMOJI } from "@/lib/highlights";
import { difficulty } from "@/lib/difficulty";
import SiteFooter from "@/components/SiteFooter";
import MiniMap from "@/components/MiniMap";

type Row = {
  id: string;
  name: string;
  sport: string;
  stats: { distanceM: number; ascendM: number };
  waypoints: { lon: number; lat: number }[];
  // Route-vorm-thumbnail (Komoot-stijl): geometry-coords voor de MiniMap.
  geometry: { coordinates: [number, number][] } | null;
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
// Sorteeropties voor de browse-lijst. "nearest" = het bestaande gedrag
// (proximity via geolocatie; zonder locatie een stabiele volgorde).
const SORTS = ["nearest", "shortest", "longest", "climbing"] as const;
// Moeilijkheidsfilter: dezelfde drie niveaus als de badge (lib/difficulty).
// "all" = geen filter. Beginners willen op easy kunnen filteren, niet alleen
// per-kaart de badge zien.
const DIFFS = ["all", "easy", "moderate", "hard"] as const;

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

// Rondje = start ≈ eind (< 100 m). Uit de geometry (al opgehaald voor de
// thumbnails), zelfde regel als de loop-badge op de detailpagina.
function isLoopRoute(geometry: { coordinates: [number, number][] } | null) {
  const c = geometry?.coordinates;
  return !!c && c.length >= 2 && haversineKm(c[0], c[c.length - 1]) < 0.1;
}

export default function DiscoverPage() {
  const t = useTranslations("discover");
  const ts = useTranslations("planner.sports");
  const tr = useTranslations("regionPage");
  const tdiff = useTranslations("planner.difficultyLabels");
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
  const [diff, setDiff] = useState<string>("all");
  const [sortBy, setSortBy] = useState<(typeof SORTS)[number]>("nearest");
  const [loopOnly, setLoopOnly] = useState(false);
  const [pos, setPos] = useState<[number, number] | null>(null);
  // Status van de locatie-aanvraag, zodat "Dichtstbij" feedback geeft i.p.v.
  // stil niets te doen als er geen locatie is (zonder pos zijn alle afstanden
  // null en sorteert nearest op de ruwe fetch-volgorde).
  const [geoState, setGeoState] = useState<"idle" | "loading" | "off">("idle");
  // GEN-116: region × category combos with enough content for a page.
  const [combos, setCombos] = useState<Combo[]>([]);

  // Vraag de locatie op voor de "Dichtstbij"-sortering — bij mount én zodra de
  // gebruiker die sortering expliciet kiest zonder dat we al een positie hebben.
  const requestLocation = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeoState("off");
      return;
    }
    setGeoState("loading");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setPos([p.coords.longitude, p.coords.latitude]);
        setGeoState("idle");
      },
      () => setGeoState("off"),
      { timeout: 8000 },
    );
  }, []);

  useEffect(() => {
    sb.from("tours")
      .select("id,name,sport,stats,waypoints,geometry")
      .eq("visibility", "public")
      .eq("kind", "planned")
      .limit(100)
      .then(({ data }) => {
        setRows((data as Row[]) ?? []);
        setLoading(false);
      });
    // Fase C admin-curatie: uitgelichte routes bovenaan als aparte rail.
    sb.from("tours")
      .select("id,name,sport,stats,waypoints,geometry")
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
    requestLocation();
  }, [sb, requestLocation]);

  // Filters uit de URL herstellen (deelbaar/bladwijzerbaar, overleeft refresh
  // en deep-links van elders). Ná mount i.p.v. in de state-init: dan renderen
  // server en eerste client-render allebei de defaults → geen hydration-
  // mismatch. Schrijven gebeurt alleen in de klik-handlers (syncUrl), dus geen
  // effect dat de zojuist gelezen waarde kan overschrijven.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const s = p.get("sport");
    if (s && SPORTS.includes(s)) setSport(s);
    const b = p.get("band");
    if (b && BANDS.some(([k]) => k === b)) setBand(b);
    const df = p.get("diff");
    if (df && (DIFFS as readonly string[]).includes(df)) setDiff(df);
    const so = p.get("sort");
    if (so && (SORTS as readonly string[]).includes(so))
      setSortBy(so as (typeof SORTS)[number]);
    if (p.get("loop") === "1") setLoopOnly(true);
  }, []);

  // Defaults ("all" / "nearest" / geen loop) → géén param (schone URL).
  // Override-object: alleen de zojuist gewijzigde waarde geef je mee, de rest
  // wordt uit de huidige state gelezen (pre-setState, dus nog de oude — precies
  // de waarden die niet veranderen). replaceState stapelt geen history.
  function syncUrl(next: {
    sport?: string;
    band?: string;
    sort?: string;
    loop?: boolean;
    diff?: string;
  }) {
    const sp = next.sport ?? sport;
    const bd = next.band ?? band;
    const so = next.sort ?? sortBy;
    const lp = next.loop ?? loopOnly;
    const df = next.diff ?? diff;
    const url = new URL(window.location.href);
    if (sp !== "all") url.searchParams.set("sport", sp);
    else url.searchParams.delete("sport");
    if (bd !== "all") url.searchParams.set("band", bd);
    else url.searchParams.delete("band");
    if (df !== "all") url.searchParams.set("diff", df);
    else url.searchParams.delete("diff");
    if (so !== "nearest") url.searchParams.set("sort", so);
    else url.searchParams.delete("sort");
    if (lp) url.searchParams.set("loop", "1");
    else url.searchParams.delete("loop");
    window.history.replaceState(null, "", url);
  }

  const [, lo, hi] = BANDS.find(([k]) => k === band)!;
  const filtered = rows
    .filter((r) => sport === "all" || r.sport === sport)
    .filter((r) => r.stats.distanceM >= lo && r.stats.distanceM < hi)
    .filter(
      (r) =>
        diff === "all" ||
        difficulty(r.sport, r.stats.distanceM, r.stats.ascendM) === diff,
    )
    .filter((r) => !loopOnly || isLoopRoute(r.geometry))
    .map((r) => ({
      ...r,
      distKm: pos && r.waypoints[0] ? haversineKm(pos, [r.waypoints[0].lon, r.waypoints[0].lat]) : null,
    }))
    .sort((a, b) => {
      switch (sortBy) {
        case "shortest":
          return a.stats.distanceM - b.stats.distanceM;
        case "longest":
          return b.stats.distanceM - a.stats.distanceM;
        case "climbing":
          return b.stats.ascendM - a.stats.ascendM;
        default: // nearest
          return (a.distKm ?? 1e9) - (b.distKm ?? 1e9);
      }
    });

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
                className="w-56 shrink-0 overflow-hidden rounded-xl border border-amber-200 bg-amber-50/50 hover:border-amber-300"
              >
                <div className="flex h-20 items-center justify-center border-b border-amber-100 bg-white/60 p-2">
                  <MiniMap coords={r.geometry?.coordinates} className="h-full w-full" />
                </div>
                <div className="px-4 py-3">
                  <div className="truncate text-sm font-medium text-neutral-900">{r.name}</div>
                  <div className="mt-0.5 text-xs text-neutral-500">
                    {(r.stats.distanceM / 1000).toFixed(1)} km · ↗ {r.stats.ascendM} m · {ts(r.sport as never)}
                  </div>
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
            onClick={() => {
              setSport(s);
              syncUrl({ sport: s });
            }}
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
            onClick={() => {
              setBand(k);
              syncUrl({ band: k });
            }}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              band === k ? "bg-neutral-800 text-white" : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
            }`}
          >
            {t(`bands.${k}` as never)}
          </button>
        ))}
        {/* Rondje-filter: veel wandelaars/fietsers willen terug naar de start.
            isLoop uit de geometry (al opgehaald voor de thumbnails). */}
        <button
          type="button"
          onClick={() => {
            const next = !loopOnly;
            setLoopOnly(next);
            syncUrl({ loop: next });
          }}
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            loopOnly
              ? "bg-emerald-700 text-white"
              : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
          }`}
        >
          🔁 {t("loopsOnly")}
        </button>
      </div>
      {/* Moeilijkheidsfilter: zelfde drie niveaus + kleuren als de badge, zodat
          je bijv. als beginner direct alleen easy-routes overhoudt. Actieve
          chip krijgt de badge-kleur, "all" blijft neutraal. */}
      <div className="mt-2 flex flex-wrap gap-1">
        {DIFFS.map((d) => {
          const active = diff === d;
          const activeColor =
            d === "easy"
              ? "bg-emerald-700 text-white"
              : d === "moderate"
                ? "bg-amber-600 text-white"
                : d === "hard"
                  ? "bg-red-700 text-white"
                  : "bg-neutral-800 text-white";
          return (
            <button
              key={d}
              type="button"
              onClick={() => {
                setDiff(d);
                syncUrl({ diff: d });
              }}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                active
                  ? activeColor
                  : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
              }`}
            >
              {d === "all" ? t("diffAll") : tdiff(d)}
            </button>
          );
        })}
      </div>
      {/* Sorteren: label vóór de chips zodat het niet als extra filter leest.
          "nearest" (default) = het oude proximity-gedrag. */}
      <div className="mt-2 flex flex-wrap items-center gap-1">
        <span className="mr-1 text-xs font-medium text-neutral-400">
          {t("sortBy")}
        </span>
        {SORTS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => {
              setSortBy(s);
              syncUrl({ sort: s });
              // "Dichtstbij" heeft een positie nodig; vraag 'm op als we die
              // (nog) niet hebben i.p.v. stil op fetch-volgorde te sorteren.
              if (s === "nearest" && !pos) requestLocation();
            }}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              sortBy === s
                ? "bg-emerald-700 text-white"
                : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
            }`}
          >
            {t(`sort.${s}` as never)}
          </button>
        ))}
      </div>
      {/* Feedback voor "Dichtstbij" zonder locatie — anders lijkt de sortering
          stil kapot (geen positie = geen herordening). */}
      {sortBy === "nearest" && !pos && (
        <p className="mt-1.5 text-[11px] text-neutral-500">
          {geoState === "loading" ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-neutral-300 border-t-emerald-600" />
              {t("geoLoading")}
            </span>
          ) : (
            <button
              type="button"
              onClick={requestLocation}
              className="text-emerald-700 hover:underline"
            >
              📍 {t("geoHint")}
            </button>
          )}
        </p>
      )}

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
            {(sport !== "all" || band !== "all" || diff !== "all" || loopOnly) && (
              <button
                type="button"
                onClick={() => {
                  setSport("all");
                  setBand("all");
                  setDiff("all");
                  setLoopOnly(false);
                  syncUrl({ sport: "all", band: "all", diff: "all", loop: false });
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
            className="overflow-hidden rounded-xl border border-neutral-100 bg-white shadow-sm transition hover:shadow-md"
          >
            {/* Route-vorm-thumbnail: scan de lijst op vorm/rondje zoals bij
                Komoot i.p.v. alleen tekst. Lichte SVG-polyline, geen kaart. */}
            <div className="flex h-24 items-center justify-center border-b border-neutral-100 bg-neutral-50 p-2">
              <MiniMap coords={r.geometry?.coordinates} className="h-full w-full" />
            </div>
            <div className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="font-medium text-neutral-900">{r.name}</div>
              {/* Moeilijkheidsbadge zodat je op de browse-lijst kunt scannen
                  op easy/hard (zelfde formule + kleuren als tour/planner). */}
              {(() => {
                const d = difficulty(r.sport, r.stats.distanceM, r.stats.ascendM);
                return (
                  <span
                    className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      d === "easy"
                        ? "bg-emerald-100 text-emerald-800"
                        : d === "moderate"
                          ? "bg-amber-100 text-amber-800"
                          : "bg-red-100 text-red-800"
                    }`}
                  >
                    {tdiff(d)}
                  </span>
                );
              })()}
            </div>
            <div className="mt-1 text-xs text-neutral-500">
              {(r.stats.distanceM / 1000).toFixed(1)} km · ↗ {r.stats.ascendM} m ·{" "}
              <span className="capitalize">{ts(r.sport as never)}</span>
              {r.distKm !== null && (
                <span> · {Math.round(r.distKm)} km {t("away")}</span>
              )}
            </div>
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
