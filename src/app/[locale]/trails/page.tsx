import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { supabaseServer } from "@/lib/supabase/server";
import { difficulty } from "@/lib/difficulty";
import SiteFooter from "@/components/SiteFooter";
import { getSiteSettings, pageTitle } from "@/lib/siteSettings";

// GEN-145 — index van officiële routes (OSM-import): sport-chips +
// regio-filter, zelfde interactiepatroon als /discover (GET-params,
// server component — SEO-vriendelijk).

export const dynamic = "force-dynamic";

type TrailRow = {
  id: string;
  name: string;
  sport: "hike" | "touring" | "mtb";
  region: string | null;
  roundtrip: boolean;
  stats: { distanceM: number; timeS: number; ascendM: number };
  is_gravel: boolean;
  gravel_m: number;
};

// Gravel is géén eigen OSM-sport — route=gravel bestaat niet als relatie, dus
// de import kan het niet ophalen. Het is een afgeleide vlag op touring-routes
// (zie trail_is_gravel() in de DB), en deze chip filtert dus op is_gravel.
const SPORTS = ["all", "hike", "touring", "gravel", "mtb"] as const;

// Server-side sortering. JSONB-numeriek sorteren kán via PostgREST met `->`
// (niet `->>`): `stats->distanceM` ordent numeriek, geverifieerd. "name" =
// de bestaande alfabetische default.
const TRAIL_SORTS = {
  name: { col: "name", asc: true },
  shortest: { col: "stats->distanceM", asc: true },
  longest: { col: "stats->distanceM", asc: false },
  climbing: { col: "stats->ascendM", asc: false },
} as const;
type TrailSort = keyof typeof TRAIL_SORTS;

// ISO-landcode → vlag-emoji (regional indicators); naam via Intl.DisplayNames.
function flag(iso: string): string {
  return String.fromCodePoint(
    ...iso.toUpperCase().split("").map((c) => 0x1f1e6 + c.charCodeAt(0) - 65),
  );
}

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const t = await getTranslations({ locale: params.locale, namespace: "trailsPage" });
  return {
    title: pageTitle(await getSiteSettings(), t("title")),
    description: t("subtitle"),
  };
}

export default async function TrailsPage({
  params,
  searchParams,
}: {
  params: { locale: string };
  searchParams: {
    sport?: string;
    country?: string;
    region?: string;
    q?: string;
    loop?: string;
    sort?: string;
  };
}) {
  const { locale } = params;
  const t = await getTranslations("trailsPage");
  const tp = await getTranslations("planner");

  const sport = SPORTS.includes(searchParams.sport as never)
    ? (searchParams.sport as (typeof SPORTS)[number])
    : "all";
  const country = /^[A-Z]{2}$/.test(searchParams.country ?? "")
    ? searchParams.country!
    : "all";
  const region = searchParams.region ?? "all";
  const q = searchParams.q?.trim() ?? "";
  const loopOnly = searchParams.loop === "1";
  const sort: TrailSort =
    searchParams.sort && searchParams.sort in TRAIL_SORTS
      ? (searchParams.sort as TrailSort)
      : "name";

  const sb = supabaseServer();
  // Cap op de lijst; als 'ie geraakt wordt tonen we een verfijn-hint i.p.v.
  // stil de rest (NL alleen al ~4.4k trails) weg te laten.
  const TRAIL_LIMIT = 200;
  let query = sb
    .from("trails")
    .select("id,name,sport,region,roundtrip,stats,is_gravel,gravel_m")
    .order(TRAIL_SORTS[sort].col, { ascending: TRAIL_SORTS[sort].asc })
    .limit(TRAIL_LIMIT);
  if (sport === "gravel") query = query.eq("is_gravel", true);
  else if (sport !== "all") query = query.eq("sport", sport);
  if (country !== "all") query = query.eq("country", country);
  if (region !== "all") query = query.eq("region", region);
  if (q) query = query.ilike("name", `%${q}%`);
  if (loopOnly) query = query.eq("roundtrip", true);

  // Regio-chips alleen bínnen een gekozen land (Europa-breed = te veel).
  const [{ data }, countriesQ, regionsQ] = await Promise.all([
    query,
    sb.rpc("trail_countries").then(
      (r) => r,
      () => ({ data: null }),
    ),
    country !== "all"
      ? sb
          .from("trails")
          .select("region")
          .eq("country", country)
          .not("region", "is", null)
          .limit(5000)
      : Promise.resolve({ data: [] }),
  ]);
  const trails = (data as TrailRow[]) ?? [];
  // RPC levert land + aantal, gesorteerd op aantal (meeste content eerst).
  const countries = (countriesQ.data as { country: string; n: number }[] | null) ?? [
    { country: "NL", n: 0 },
  ];
  const regions = Array.from(
    new Set(((regionsQ.data as { region: string }[]) ?? []).map((r) => r.region)),
  ).sort();
  const countryName = new Intl.DisplayNames([locale], { type: "region" });

  const href = (patch: Record<string, string>) => {
    const p = new URLSearchParams();
    // land wisselen reset de regio (regio's zijn land-gebonden)
    const merged = {
      sport,
      country,
      region,
      q,
      loop: loopOnly ? "1" : "",
      sort,
      ...("country" in patch ? { region: "all" } : {}),
      ...patch,
    };
    if (merged.sport !== "all") p.set("sport", merged.sport);
    if (merged.country !== "all") p.set("country", merged.country);
    if (merged.region !== "all") p.set("region", merged.region);
    if (merged.q) p.set("q", merged.q);
    if (merged.loop === "1") p.set("loop", "1");
    if (merged.sort && merged.sort !== "name") p.set("sort", merged.sort);
    const s = p.toString();
    return `/${locale}/trails${s ? `?${s}` : ""}`;
  };

  return (
    <main className="mx-auto min-h-dvh max-w-4xl px-4 pb-16 pt-20">
      <h1 className="text-2xl font-bold text-neutral-900">{t("title")}</h1>
      <p className="mt-1 text-sm text-neutral-500">{t("subtitle")}</p>

      {/* Land achter een label i.p.v. 28 vlaggen open en bloot (Komoot zet
          filters ook achter een knop). <details> = geen JS nodig, links
          blijven crawlbaar voor SEO. */}
      {countries.length > 1 && (
        <details className="group mt-4">
          <summary className="inline-flex cursor-pointer list-none items-center gap-2 rounded-full bg-neutral-100 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-200">
            <span>
              {country === "all"
                ? `🌍 ${t("allCountries")}`
                : `${flag(country)} ${countryName.of(country) ?? country}`}
            </span>
            <span className="text-neutral-400 group-open:hidden">▾</span>
            <span className="hidden text-neutral-400 group-open:inline">▴</span>
          </summary>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <a
              href={href({ country: "all" })}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                country === "all"
                  ? "bg-neutral-800 text-white"
                  : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
              }`}
            >
              🌍 {t("allCountries")}
            </a>
            {countries.map(({ country: c, n }) => (
              <a
                key={c}
                href={href({ country: c })}
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  country === c
                    ? "bg-neutral-800 text-white"
                    : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                }`}
              >
                {flag(c)} {countryName.of(c) ?? c}{" "}
                <span className={country === c ? "text-neutral-300" : "text-neutral-400"}>
                  {n}
                </span>
              </a>
            ))}
          </div>
        </details>
      )}

      <div className="mt-2 flex flex-wrap gap-1.5">
        {SPORTS.map((s) => (
          <a
            key={s}
            href={href({ sport: s })}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              sport === s
                ? "bg-emerald-700 text-white"
                : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
            }`}
          >
            {s === "all" ? t("allSports") : tp(`sports.${s}` as never)}
          </a>
        ))}
        {/* Rondje-filter op de echte roundtrip-kolom — veel wandelaars/fietsers
            willen terug naar de start. */}
        <a
          href={href({ loop: loopOnly ? "" : "1" })}
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            loopOnly
              ? "bg-emerald-700 text-white"
              : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
          }`}
        >
          🔁 {t("loopsOnly")}
        </a>
      </div>
      {/* Regio's kunnen er 16+ zijn (Bundesländer, départements) — zelfde
          inklap-patroon als het land. */}
      {regions.length > 1 && (
        <details className="group mt-2">
          <summary className="inline-flex cursor-pointer list-none items-center gap-2 rounded-full bg-neutral-100 px-3 py-1 text-[11px] text-neutral-700 hover:bg-neutral-200">
            <span>📍 {region === "all" ? t("allRegions") : region}</span>
            <span className="text-neutral-400 group-open:hidden">▾</span>
            <span className="hidden text-neutral-400 group-open:inline">▴</span>
          </summary>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <a
              href={href({ region: "all" })}
              className={`rounded-full px-2.5 py-0.5 text-[11px] ${
                region === "all" ? "bg-neutral-800 text-white" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
              }`}
            >
              {t("allRegions")}
            </a>
            {regions.map((r) => (
              <a
                key={r}
                href={href({ region: r })}
                className={`rounded-full px-2.5 py-0.5 text-[11px] ${
                  region === r ? "bg-neutral-800 text-white" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                }`}
              >
                {r}
              </a>
            ))}
          </div>
        </details>
      )}
      <form className="mt-3">
        {sport !== "all" && <input type="hidden" name="sport" value={sport} />}
        {country !== "all" && <input type="hidden" name="country" value={country} />}
        {region !== "all" && <input type="hidden" name="region" value={region} />}
        {/* Óók loop/sort meesturen, anders dropt de naam-zoek die filters. */}
        {loopOnly && <input type="hidden" name="loop" value="1" />}
        {sort !== "name" && <input type="hidden" name="sort" value={sort} />}
        <input
          name="q"
          defaultValue={q}
          placeholder={t("searchPlaceholder")}
          className="w-full max-w-sm rounded-lg border border-neutral-200 px-3 py-1.5 text-sm"
        />
      </form>

      {/* Server-side sortering (JSONB-numeriek via PostgREST). "A–Z" = default. */}
      <div className="mt-3 flex flex-wrap items-center gap-1">
        <span className="mr-1 text-xs font-medium text-neutral-400">
          {t("sortBy")}
        </span>
        {(Object.keys(TRAIL_SORTS) as TrailSort[]).map((s) => (
          <a
            key={s}
            href={href({ sort: s })}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              sort === s
                ? "bg-emerald-700 text-white"
                : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
            }`}
          >
            {t(`sort.${s}` as never)}
          </a>
        ))}
      </div>

      {trails.length === 0 ? (
        <div className="mt-8 flex flex-col items-start gap-2">
          <p className="text-sm text-neutral-400">{t("empty")}</p>
          {/* Reset alleen tonen als er echt een filter/zoekterm actief is —
              anders helpt wissen niet. Link naar de kale /trails (server-
              component, dus geen client-state om te resetten). */}
          {(sport !== "all" ||
            country !== "all" ||
            region !== "all" ||
            q !== "") && (
            <a
              href={`/${locale}/trails`}
              className="text-sm font-medium text-emerald-700 hover:underline"
            >
              {t("clearFilters")}
            </a>
          )}
        </div>
      ) : (
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          {trails.map((tr) => (
            <a
              key={tr.id}
              href={`/${locale}/trail/${tr.id}`}
              // min-w-0 óók op de grid-cel zelf: grid-items hebben net als
              // flex-items min-width:auto, dus een lange naam maakte de kaart
              // breder dan zijn kolom (gemeten: 673px in een 358px-track).
              className="min-w-0 rounded-xl border border-neutral-100 bg-white px-4 py-3 shadow-sm transition hover:border-emerald-200 hover:shadow"
            >
              <div className="flex items-center justify-between gap-2">
                {/* min-w-0: flex-items hebben min-width:auto, waardoor lange
                    namen (Duitse HWW-etappes) truncate negeerden en de kaart
                    buiten het scherm duwden. */}
                <span className="min-w-0 truncate text-sm font-medium text-neutral-900">
                  {tr.name}
                </span>
                <span className="shrink-0 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">
                  {tp(`difficultyLabels.${difficulty(tr.sport, tr.stats.distanceM, tr.stats.ascendM)}` as never)}
                </span>
              </div>
              <div className="mt-0.5 text-xs text-neutral-500">
                {(tr.stats.distanceM / 1000).toFixed(1)} km · ↗ {tr.stats.ascendM} m ·{" "}
                {tp(`sports.${tr.sport}` as never)}
                {tr.is_gravel
                  ? ` · ${t("gravelMeta", { km: (tr.gravel_m / 1000).toFixed(1) })}`
                  : ""}
                {tr.roundtrip ? " · 🔁" : ""}
                {tr.region ? ` · ${tr.region}` : ""}
              </div>
            </a>
          ))}
        </div>
      )}
      {trails.length === TRAIL_LIMIT && (
        <p className="mt-4 rounded-lg bg-neutral-50 px-3 py-2 text-xs text-neutral-500">
          {t("capHint", { count: TRAIL_LIMIT })}
        </p>
      )}
      <p className="mt-8 text-[11px] text-neutral-400">{t("attribution")}</p>
      <SiteFooter />
    </main>
  );
}
