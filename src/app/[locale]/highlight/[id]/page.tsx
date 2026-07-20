import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { supabaseServer } from "@/lib/supabase/server";
import { GEO_REVERSE_BASE, geoHeaders } from "@/lib/geo";
import { getWeather } from "@/lib/weather";
import { CATEGORY_EMOJI } from "@/lib/highlights";
import { gradientFor } from "@/lib/collections";
import HighlightMap from "@/components/HighlightMap";
import HighlightActions from "@/components/HighlightActions";

// GEN-138 — highlight detail page. Anatomy copied from Komoot's highlight
// pages (torn down live 2026-07-20): photo grid, per-sport ratings, tips,
// nearby routes, weather + packing tip, nearby-places link mesh, planner CTA.

export const revalidate = 3600;

type Highlight = {
  id: string;
  name: string;
  category: string;
  lon: number;
  lat: number;
  description: string | null;
};
type Vote = { value: number; sport: string | null };
type Tip = { id: string; sport: string | null; text: string; created_at: string };
type Photo = { id: string; path: string };
type TourLite = {
  id: string;
  name: string;
  sport: string;
  stats: { distanceM: number; timeS: number; ascendM: number };
  waypoints: { lon: number; lat: number }[];
};

function haversineKm(aLon: number, aLat: number, bLon: number, bLat: number) {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLon = ((bLon - aLon) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) *
      Math.cos((bLat * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

async function getHighlight(id: string): Promise<Highlight | null> {
  const sb = supabaseServer();
  const { data } = await sb
    .from("highlights")
    .select("id,name,category,lon,lat,description")
    .eq("id", id)
    .eq("kind", "point")
    .maybeSingle();
  return (data as Highlight) ?? null;
}

async function getPlace(lon: number, lat: number): Promise<string | null> {
  // Reverse-geocode the location line via our own Photon.
  try {
    const url = new URL(GEO_REVERSE_BASE);
    url.searchParams.set("lon", String(lon));
    url.searchParams.set("lat", String(lat));
    url.searchParams.set("limit", "1");
    const res = await fetch(url, { headers: geoHeaders(), next: { revalidate: 86400 } });
    const data = await res.json();
    const p = data.features?.[0]?.properties;
    if (!p) return null;
    return [p.city ?? p.name, p.state, p.country].filter(Boolean).join(", ");
  } catch {
    return null;
  }
}


export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  const hl = await getHighlight(params.id);
  if (!hl) return { title: "Highlight not found" };
  // Komoot's SEO title pattern: "<Name> – Wandel- & Fietsroutes"
  return {
    title: `${hl.name} – Wandel- & Fietsroutes | Outdoor Route Planner`,
    description:
      hl.description?.slice(0, 160) ??
      `Ontdek ${hl.name}: community-highlight met tips, foto's en routes in de buurt.`,
  };
}

export default async function HighlightPage({
  params,
}: {
  params: { id: string; locale: string };
}) {
  const hl = await getHighlight(params.id);
  if (!hl) notFound();
  const { locale } = params;
  const t = await getTranslations("highlightPage");
  const ts = await getTranslations("planner.sports");

  const sb = supabaseServer();
  const [votesQ, tipsQ, photosQ, toursQ, nearbyQ, place, weather] =
    await Promise.all([
      sb.from("highlight_votes").select("value,sport").eq("highlight_id", hl.id),
      sb
        .from("highlight_tips")
        .select("id,sport,text,created_at")
        .eq("highlight_id", hl.id)
        .order("created_at", { ascending: false })
        .limit(20),
      sb
        .from("highlight_photos")
        .select("id,path")
        .eq("highlight_id", hl.id)
        .order("created_at", { ascending: false })
        .limit(9),
      sb
        .from("tours")
        .select("id,name,sport,stats,waypoints")
        .eq("visibility", "public")
        .eq("kind", "planned")
        .limit(100),
      sb
        .from("highlights")
        .select("id,name,category,lon,lat")
        .eq("kind", "point")
        .limit(2000),
      getPlace(hl.lon, hl.lat),
      getWeather(hl.lon, hl.lat),
    ]);

  const votes = (votesQ.data as Vote[]) ?? [];
  const tips = (tipsQ.data as Tip[]) ?? [];
  const photos = (photosQ.data as Photo[]) ?? [];

  // Per-sport recommendation percentages (Komoot's signature block).
  const bySport = new Map<string, { pos: number; total: number }>();
  for (const v of votes) {
    const key = v.sport ?? "all";
    const e = bySport.get(key) ?? { pos: 0, total: 0 };
    e.total++;
    if (v.value > 0) e.pos++;
    bySport.set(key, e);
  }

  const nearTours = (((toursQ.data as TourLite[]) ?? [])
    .map((tr) => ({
      ...tr,
      distKm: tr.waypoints[0]
        ? haversineKm(hl.lon, hl.lat, tr.waypoints[0].lon, tr.waypoints[0].lat)
        : Infinity,
    }))
    .filter((tr) => tr.distKm <= 30)
    .sort((a, b) => a.distKm - b.distKm)
    .slice(0, 5));

  const nearHighlights = (
    ((nearbyQ.data as (Highlight & { category: string })[]) ?? [])
      .filter((h) => h.id !== hl.id)
      .map((h) => ({ ...h, distKm: haversineKm(hl.lon, hl.lat, h.lon, h.lat) }))
      .sort((a, b) => a.distKm - b.distKm)
      .slice(0, 8)
  );

  const storageBase = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/highlight-photos/`;
  const plannerHref = `/${locale}?at=${hl.lon.toFixed(5)},${hl.lat.toFixed(5)}&atn=${encodeURIComponent(hl.name)}`;

  return (
    <main className="mx-auto min-h-dvh max-w-4xl px-4 pb-16 pt-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "TouristAttraction",
            name: hl.name,
            description: hl.description ?? undefined,
            geo: { "@type": "GeoCoordinates", latitude: hl.lat, longitude: hl.lon },
            ...(place ? { address: place } : {}),
          }),
        }}
      />

      {/* Breadcrumb-lite */}
      <nav className="mt-2 text-xs text-neutral-400">
        <a href={`/${locale}/discover`} className="hover:underline">
          {t("breadcrumbDiscover")}
        </a>
        {" / "}
        <span>{t(`cat.${hl.category}` as never)}</span>
        {" / "}
        <span className="text-neutral-600">{hl.name}</span>
      </nav>

      {/* Photo grid or gradient hero */}
      {photos.length > 0 ? (
        <div className="mt-3 grid h-56 grid-cols-3 gap-1 overflow-hidden rounded-2xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`${storageBase}${photos[0].path}`}
            alt={hl.name}
            className="col-span-2 h-full w-full object-cover"
          />
          <div className="grid grid-rows-2 gap-1">
            {photos.slice(1, 3).map((p) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={p.id}
                src={`${storageBase}${p.path}`}
                alt=""
                className="h-full w-full object-cover"
              />
            ))}
          </div>
        </div>
      ) : (
        <div
          className={`mt-3 flex h-40 items-center justify-center rounded-2xl bg-gradient-to-br ${gradientFor()}`}
        >
          <span className="text-6xl opacity-90 drop-shadow">
            {CATEGORY_EMOJI[hl.category] ?? "📍"}
          </span>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-medium uppercase tracking-wide text-amber-700">
            {CATEGORY_EMOJI[hl.category]} {t("kind")} • {t(`cat.${hl.category}` as never)}
          </div>
          <h1 className="mt-1 text-3xl font-semibold text-neutral-900">{hl.name}</h1>
          {place && (
            <p className="mt-1 text-sm text-neutral-500">
              {t("location")}: {place}
            </p>
          )}
        </div>
        <div className="flex shrink-0 gap-2">
          <a
            href={plannerHref}
            className="rounded-full bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
          >
            {t("bringMeHere")}
          </a>
        </div>
      </div>

      {/* Per-sport recommendation chips */}
      {bySport.size > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {Array.from(bySport.entries()).map(([sport, { pos, total }]) => (
            <span
              key={sport}
              className="rounded-full border border-neutral-200 px-2.5 py-1 text-xs text-neutral-700"
            >
              {sport === "all" ? t("allSports") : ts(sport as never)} ·{" "}
              <span className="font-semibold">
                {Math.round((pos / total) * 100)}%
              </span>{" "}
              <span className="text-neutral-400">({total})</span>
            </span>
          ))}
        </div>
      )}

      {hl.description && (
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-neutral-700">
          {hl.description}
        </p>
      )}

      <div className="mt-6 grid gap-8 md:grid-cols-[1fr_320px]">
        <div className="min-w-0">
          {/* Interactive contribution island: vote / tip / photo */}
          <HighlightActions highlightId={hl.id} />

          {/* Tips */}
          <h2 className="mt-8 text-lg font-semibold text-neutral-900">
            {t("tips")}
          </h2>
          {tips.length === 0 ? (
            <p className="mt-2 text-sm text-neutral-400">{t("noTips")}</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-4">
              {tips.map((tip) => (
                <li key={tip.id} className="border-b border-neutral-100 pb-3">
                  <div className="text-xs text-neutral-400">
                    {new Date(tip.created_at).toLocaleDateString(locale)}
                    {tip.sport ? ` · ${ts(tip.sport as never)}` : ""}
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-700">
                    {tip.text}
                  </p>
                </li>
              ))}
            </ul>
          )}

          {/* Nearby routes */}
          <h2 id="nearby" className="mt-8 text-lg font-semibold text-neutral-900">
            {t("nearbyRoutes")}
          </h2>
          {nearTours.length === 0 ? (
            <p className="mt-2 text-sm text-neutral-400">{t("noRoutes")}</p>
          ) : (
            <div className="mt-3 flex flex-col gap-2">
              {nearTours.map((tr, i) => (
                <a
                  key={tr.id}
                  href={`/${locale}/tour/${tr.id}`}
                  className="rounded-xl border border-neutral-100 bg-white p-3 shadow-sm transition hover:shadow-md"
                >
                  <div className="font-medium text-neutral-900">
                    <span className="mr-1 text-neutral-400">#{i + 1}</span>
                    {tr.name}
                  </div>
                  <div className="mt-0.5 text-xs text-neutral-500">
                    {(tr.stats.distanceM / 1000).toFixed(1)} km · ↗{" "}
                    {tr.stats.ascendM} m ·{" "}
                    <span className="capitalize">{ts(tr.sport as never)}</span> ·{" "}
                    {Math.round(tr.distKm)} km {t("away")}
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>

        <aside>
          <HighlightMap lon={hl.lon} lat={hl.lat} />

          {/* Weather + packing tip */}
          {weather && (
            <div className="mt-4 rounded-xl border border-neutral-100 bg-white p-3 shadow-sm">
              <h3 className="text-sm font-semibold text-neutral-900">
                {t("weather")}
              </h3>
              <div className="mt-2 flex gap-2 overflow-x-auto text-center">
                {weather.days.map((d) => (
                  <div key={d.date} className="min-w-12 shrink-0">
                    <div className="text-[10px] text-neutral-400">
                      {new Date(d.date).toLocaleDateString(locale, {
                        weekday: "short",
                      })}
                    </div>
                    <div className="text-sm font-medium">{d.tMax}°</div>
                    <div className="text-[11px] text-neutral-400">{d.tMin}°</div>
                    <div className="text-[10px] text-sky-600">{d.rain}%</div>
                  </div>
                ))}
              </div>
              {weather.packTip && (
                <p className="mt-2 rounded-lg bg-neutral-50 px-2 py-1.5 text-xs text-neutral-600">
                  {t(`pack.${weather.packTip}` as never)}
                </p>
              )}
            </div>
          )}

          {/* Nearby highlights — the internal-linking mesh */}
          {nearHighlights.length > 0 && (
            <div className="mt-4">
              <h3 className="text-sm font-semibold text-neutral-900">
                {t("nearbyHighlights")}
              </h3>
              <ul className="mt-2 flex flex-col gap-1">
                {nearHighlights.map((h) => (
                  <li key={h.id}>
                    <a
                      href={`/${locale}/highlight/${h.id}`}
                      className="flex items-baseline justify-between gap-2 text-sm text-neutral-700 hover:text-emerald-800"
                    >
                      <span className="min-w-0 truncate">
                        {CATEGORY_EMOJI[h.category]} {h.name}
                      </span>
                      <span className="shrink-0 text-xs text-neutral-400">
                        {h.distKm < 1
                          ? `${Math.round(h.distKm * 1000)} m`
                          : `${h.distKm.toFixed(1)} km`}
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>

      <footer className="mt-16 border-t border-neutral-100 pt-4 text-xs text-neutral-400">
        © {new Date().getFullYear()} Outdoor Route Planner ·{" "}
        <a href="https://www.openstreetmap.org/copyright" className="hover:underline">
          © OpenStreetMap contributors
        </a>
      </footer>
    </main>
  );
}
