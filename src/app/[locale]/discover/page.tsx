"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseBrowser } from "@/lib/supabase/client";
import { CATEGORY_EMOJI } from "@/lib/highlights";
import { difficulty } from "@/lib/difficulty";
import { fmtDuration } from "@/lib/activity";
import SiteFooter from "@/components/SiteFooter";
import MiniMap from "@/components/MiniMap";

type Row = {
  id: string;
  name: string;
  sport: string;
  stats: { distanceM: number; ascendM: number; timeS: number };
  waypoints: { lon: number; lat: number }[];
  // Route-vorm-thumbnail (Komoot-stijl): downsampled coords voor de MiniMap
  // (thumb_coords, ~24 pt) i.p.v. de volle geometry — scheelt payload op /discover.
  thumb_coords: [number, number][] | null;
};

const SPORTS = ["all", "hike", "run", "touring", "gravel", "mtb", "road", "ebike"];
// Zoals /api/discover/combos ze levert: globaal op aantal gesorteerd, met de
// top-Benelux achteraan aangehecht (die halen de globale top-200 niet). `country`
// laat de client de Benelux-combo's voor de nl-locale vooraan zetten.
type Combo = {
  slug: string;
  label: string;
  category: string;
  n: number;
  country?: string | null;
};
// 3.614 combo's halen de ≥8-poort — als chiprij onbruikbaar. De rijkste eerst;
// de rest blijft bereikbaar via de sitemap en de links op de regiopagina's.
const MAX_CHIPS = 60;
// Nederlandstalige bezoekers zijn vrijwel altijd op zoek naar Benelux-regio's;
// de globale top-200 is puur bergland (DE/AT/ES/IT). Voor nl zetten we daarom de
// Benelux-combo's vooraan. Andere locales houden de globale volgorde.
const BENELUX = new Set(["NL", "BE", "LU"]);
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

// Rondje = start ≈ eind (< 100 m). Uit de thumb_coords (al opgehaald voor de
// thumbnails; downsample_line behoudt begin- en eindpunt), zelfde regel als de
// loop-badge op de detailpagina.
function isLoopRoute(c: [number, number][] | null) {
  return !!c && c.length >= 2 && haversineKm(c[0], c[c.length - 1]) < 0.1;
}

// Round-robin over de aanwezige sporten zodat een showcase-sample de breedte
// van de catalogus toont i.p.v. één dominant type. Behoudt de binnenkomende
// (alfabetische) volgorde binnen elke sport.
function pickDiverseBySport(
  rows: { id: string; sport: string }[],
  n: number,
): string[] {
  const bySport = new Map<string, string[]>();
  for (const r of rows) {
    const b = bySport.get(r.sport);
    if (b) b.push(r.id);
    else bySport.set(r.sport, [r.id]);
  }
  const buckets = Array.from(bySport.values());
  const out: string[] = [];
  let i = 0;
  while (out.length < n && buckets.some((b) => b.length > 0)) {
    const b = buckets[i % buckets.length];
    if (b && b.length) out.push(b.shift()!);
    i++;
  }
  return out;
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
    {
      id: string;
      name: string;
      sport: string;
      region: string | null;
      stats: { distanceM: number; ascendM: number; timeS: number };
      thumb_coords: [number, number][] | null;
    }[]
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
  // Voor nl-bezoekers: Benelux-combo's (stabiel op hun globale n-volgorde) eerst,
  // daarna de globale rest. Andere locales houden de globale volgorde ongemoeid.
  const orderedCombos = useMemo(() => {
    if (locale !== "nl") return combos;
    const be: Combo[] = [];
    const rest: Combo[] = [];
    for (const c of combos)
      (c.country && BENELUX.has(c.country) ? be : rest).push(c);
    return [...be, ...rest];
  }, [combos, locale]);

  // Vraag de locatie op voor de "Dichtstbij"-sortering. Aangeroepen op expliciete
  // actie (Dichtstbij-chip / locatie-knop) en bij mount alléén als de permissie
  // al is verleend (zie het mount-effect; anders geen ongevraagde popup).
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
      .select("id,name,sport,stats,waypoints,thumb_coords")
      .eq("visibility", "public")
      .eq("kind", "planned")
      // Nieuwste eerst: zonder expliciete order gaf `.limit(100)` een willekeurige
      // 100 in willekeurige volgorde. Nu er 21 publieke tours zijn valt dat niet
      // op, maar zodra het er >100 worden zouden nieuwe tours onzichtbaar kunnen
      // blijven op /discover. created_at desc = deterministisch + verse content
      // bovenaan (de "Dichtstbij"-fallback zonder locatie volgt deze volgorde).
      .order("created_at", { ascending: false })
      .limit(100)
      .then(({ data }) => {
        setRows((data as Row[]) ?? []);
        setLoading(false);
      });
    // Fase C admin-curatie: uitgelichte routes bovenaan als aparte rail.
    sb.from("tours")
      .select("id,name,sport,stats,waypoints,thumb_coords")
      .eq("visibility", "public")
      .not("featured_at", "is", null)
      .order("featured_at", { ascending: false })
      .limit(10)
      .then(({ data }) => setFeatured((data as Row[]) ?? []));
    // geometry mee: de officiële-routes-kaartjes tonen een route-vorm-thumbnail
    // (MiniMap), consistent met featured + de browse-grid. 10 trail-geometrieën
    // ≈ 62 KB (gzip ~20 KB), verwaarloosbaar naast de grid.
    // NL-doelgroep: voor de nl-locale het sample op NL i.p.v. een willekeurige
    // Europa-mix (consistent met de NL-default op /trails en de Benelux-bias op
    // de regio-chips). name_sort-order (letters vóór cijfers) mijdt de OSM-
    // nummerroutes. Andere locales houden de bestaande arbitraire sample.
    // NL-showcase sport-divers maken: `.order("name_sort").limit(10)` gaf
    // vrijwel altijd 10× Wandelen (de alfabetisch-eerste NL-trails), wat de
    // breedte van de catalogus (racefiets/gravel/mtb) verbergt. Twee-staps: een
    // lichte id+sport-pool ophalen, round-robin over de sporten 10 diverse ids
    // kiezen, dan alleen díe 10 mét geometry (voor de MiniMap-thumbnail) laden.
    if (locale === "nl") {
      (async () => {
        const { data: pool } = await sb
          .from("trails")
          .select("id,sport")
          .eq("country", "NL")
          .order("name_sort")
          .limit(500);
        const ids = pickDiverseBySport(
          (pool as { id: string; sport: string }[]) ?? [],
          10,
        );
        if (!ids.length) return setTrails([]);
        const { data } = await sb
          .from("trails")
          .select("id,name,sport,region,stats,thumb_coords")
          .in("id", ids);
        // .in() geeft db-volgorde terug → herstel de diverse round-robin-volgorde.
        const pos = new Map(ids.map((id, i) => [id, i] as const));
        setTrails(
          ((data as typeof trails) ?? [])
            .slice()
            .sort((a, b) => (pos.get(a.id) ?? 0) - (pos.get(b.id) ?? 0)),
        );
      })();
    } else {
      sb
        .from("trails")
        .select("id,name,sport,region,stats,thumb_coords")
        .limit(10)
        .then(({ data }) => setTrails((data as typeof trails) ?? []));
    }
    // Tellen over `highlights` zelf ging mis: .limit(2000) leverde door de
    // PostgREST max-rows-cap 1000 willekeurige rijen van 500k, dus de counts
    // klopten niet én het gros van Europa ontbrak (14 regio's van 1.150).
    // De aggregatie zit nu achter een uur-gecachete route — zie de comment
    // daar voor waarom dit niet rechtstreeks vanuit de browser kan.
    fetch("/api/discover/combos")
      .then((r) => (r.ok ? r.json() : []))
      .then((c: Combo[]) => setCombos(c))
      .catch(() => {});
    // Bij mount NIET ongevraagd een geolocatie-permissie-popup tonen — dat is
    // intrusief bij page-load (voor de gebruiker iets doet) en kost grants.
    // Alleen automatisch de positie ophalen als 'ie al eerder is toegestaan
    // (dan is getCurrentPosition stil, geen prompt). Nog niet toegestaan →
    // wachten op expliciete actie (Dichtstbij-chip of de locatie-knop). De
    // Permissions API ontbreekt op sommige oudere browsers → dan niets doen.
    navigator.permissions
      ?.query({ name: "geolocation" as PermissionName })
      .then((res) => {
        if (res.state === "granted") requestLocation();
      })
      .catch(() => {});
  }, [sb, requestLocation, locale]);

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
    .filter((r) => !loopOnly || isLoopRoute(r.thumb_coords))
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

  // "Alle officiële routes →" behoudt de actieve sport/afstand/moeilijkheid-
  // filters, zodat de gebruiker met dezelfde context doorbrowst op /trails i.p.v.
  // op de volledige, ongefilterde lijst te belanden. Sport alleen meesturen als
  // /trails 'm kent (run/road/ebike bestaan daar niet → weglaten geeft een schone
  // URL i.p.v. een stille terugval op "all"). Moeilijkheid gebruikt dezelfde
  // easy/moderate/hard-waarden als de trails-filter (generated column).
  const trailSportSet = ["hike", "touring", "gravel", "mtb"];
  const officialParams = new URLSearchParams();
  if (trailSportSet.includes(sport)) officialParams.set("sport", sport);
  if (band !== "all") officialParams.set("band", band);
  if (diff !== "all") officialParams.set("diff", diff);
  const officialHref = `/${locale}/trails${
    officialParams.toString() ? `?${officialParams}` : ""
  }`;

  // Gedeelde moeilijkheidsbadge (zelfde formule + kleuren als de grid-kaarten),
  // zodat je op featured én officiële routes ook op easy/hard kunt scannen.
  const diffBadge = (sport: string, distanceM: number, ascendM: number) => {
    const d = difficulty(sport, distanceM, ascendM);
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
  };

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
                  <MiniMap coords={r.thumb_coords ?? undefined} className="h-full w-full" />
                </div>
                <div className="px-4 py-3">
                  <div className="truncate text-sm font-medium text-neutral-900">{r.name}</div>
                  <div className="mt-1 flex items-center gap-1.5 text-xs text-neutral-500">
                    {diffBadge(r.sport, r.stats.distanceM, r.stats.ascendM)}
                    <span className="truncate">
                      {(r.stats.distanceM / 1000).toFixed(1)} km · {fmtDuration(r.stats.timeS)} h · ↗ {r.stats.ascendM} m · {ts(r.sport as never)}
                    </span>
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
            <a href={officialHref} className="text-xs font-normal text-emerald-700 hover:underline">
              {t("trailsMore")}
            </a>
          </h2>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {trails.map((r) => (
              <a
                key={r.id}
                href={`/${locale}/trail/${r.id}`}
                className="w-56 shrink-0 overflow-hidden rounded-xl border border-emerald-200 bg-emerald-50/50 hover:border-emerald-300"
              >
                <div className="flex h-20 items-center justify-center border-b border-emerald-100 bg-white/60 p-2">
                  <MiniMap coords={r.thumb_coords ?? undefined} className="h-full w-full" />
                </div>
                <div className="px-4 py-3">
                  <div className="truncate text-sm font-medium text-neutral-900">{r.name}</div>
                  <div className="mt-1 flex items-center gap-1.5 text-xs text-neutral-500">
                    {diffBadge(r.sport, r.stats.distanceM, r.stats.ascendM)}
                    <span className="truncate">
                      {(r.stats.distanceM / 1000).toFixed(1)} km · {fmtDuration(r.stats.timeS)} h · ↗ {r.stats.ascendM} m · {ts(r.sport as never)}
                      {r.region ? ` · ${r.region}` : ""}
                    </span>
                  </div>
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
              <MiniMap coords={r.thumb_coords ?? undefined} className="h-full w-full" />
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
              {(r.stats.distanceM / 1000).toFixed(1)} km ·{" "}
              {fmtDuration(r.stats.timeS)} h · ↗ {r.stats.ascendM} m ·{" "}
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
            {orderedCombos.slice(0, MAX_CHIPS).map((c) => (
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
