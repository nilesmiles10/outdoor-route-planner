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
};

const SPORTS = ["all", "hike", "touring", "mtb"] as const;

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
  searchParams: { sport?: string; region?: string; q?: string };
}) {
  const { locale } = params;
  const t = await getTranslations("trailsPage");
  const tp = await getTranslations("planner");

  const sport = SPORTS.includes(searchParams.sport as never)
    ? (searchParams.sport as (typeof SPORTS)[number])
    : "all";
  const region = searchParams.region ?? "all";
  const q = searchParams.q?.trim() ?? "";

  const sb = supabaseServer();
  let query = sb
    .from("trails")
    .select("id,name,sport,region,roundtrip,stats")
    .order("name")
    .limit(200);
  if (sport !== "all") query = query.eq("sport", sport);
  if (region !== "all") query = query.eq("region", region);
  if (q) query = query.ilike("name", `%${q}%`);

  const [{ data }, regionsQ] = await Promise.all([
    query,
    sb.from("trails").select("region").not("region", "is", null).limit(5000),
  ]);
  const trails = (data as TrailRow[]) ?? [];
  const regions = Array.from(
    new Set(((regionsQ.data as { region: string }[]) ?? []).map((r) => r.region)),
  ).sort();

  const href = (patch: Record<string, string>) => {
    const p = new URLSearchParams();
    const merged = { sport, region, q, ...patch };
    if (merged.sport !== "all") p.set("sport", merged.sport);
    if (merged.region !== "all") p.set("region", merged.region);
    if (merged.q) p.set("q", merged.q);
    const s = p.toString();
    return `/${locale}/trails${s ? `?${s}` : ""}`;
  };

  return (
    <main className="mx-auto min-h-dvh max-w-4xl px-4 pb-16 pt-20">
      <h1 className="text-2xl font-bold text-neutral-900">{t("title")}</h1>
      <p className="mt-1 text-sm text-neutral-500">{t("subtitle")}</p>

      <div className="mt-4 flex flex-wrap gap-1.5">
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
      </div>
      {regions.length > 1 && (
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
      )}
      <form className="mt-3">
        {sport !== "all" && <input type="hidden" name="sport" value={sport} />}
        {region !== "all" && <input type="hidden" name="region" value={region} />}
        <input
          name="q"
          defaultValue={q}
          placeholder={t("searchPlaceholder")}
          className="w-full max-w-sm rounded-lg border border-neutral-200 px-3 py-1.5 text-sm"
        />
      </form>

      {trails.length === 0 ? (
        <p className="mt-8 text-sm text-neutral-400">{t("empty")}</p>
      ) : (
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          {trails.map((tr) => (
            <a
              key={tr.id}
              href={`/${locale}/trail/${tr.id}`}
              className="rounded-xl border border-neutral-100 bg-white px-4 py-3 shadow-sm transition hover:border-emerald-200 hover:shadow"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium text-neutral-900">
                  {tr.name}
                </span>
                <span className="shrink-0 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">
                  {tp(`difficultyLabels.${difficulty(tr.sport, tr.stats.distanceM, tr.stats.ascendM)}` as never)}
                </span>
              </div>
              <div className="mt-0.5 text-xs text-neutral-500">
                {(tr.stats.distanceM / 1000).toFixed(1)} km · ↗ {tr.stats.ascendM} m ·{" "}
                {tp(`sports.${tr.sport}` as never)}
                {tr.roundtrip ? " · 🔁" : ""}
                {tr.region ? ` · ${tr.region}` : ""}
              </div>
            </a>
          ))}
        </div>
      )}
      <p className="mt-8 text-[11px] text-neutral-400">{t("attribution")}</p>
      <SiteFooter />
    </main>
  );
}
