import { slugify } from "@/lib/slug";

// Data layer for the activity × country (and × region) SEO landing pages
// (/[locale]/explore/[activity]/[country]). Pages are DATA-GATED: only a combo
// with >= MIN_TRAILS real imported routes gets a page — no thin/doorway pages.
// Counts come from the `trails` table (OSM import), aggregated per country per
// activity. Country slugs are canonical (English) and shared across locales.

export type ActivityKey = "hiking" | "cycling" | "mtb" | "gravel";

export type Activity = {
  key: ActivityKey;
  /** trails.sport value, or gravel = the is_gravel flag on touring rows */
  sport?: "hike" | "touring" | "mtb";
  gravel?: boolean;
  /** planner deep-link sport + /trails sport filter */
  plannerSport: string;
  trailsSport: string;
  en: string;
  nl: string;
};

export const ACTIVITIES: Activity[] = [
  { key: "hiking", sport: "hike", plannerSport: "hike", trailsSport: "hike", en: "Hiking routes", nl: "Wandelroutes" },
  { key: "cycling", sport: "touring", plannerSport: "touring", trailsSport: "touring", en: "Cycling routes", nl: "Fietsroutes" },
  { key: "mtb", sport: "mtb", plannerSport: "mtb", trailsSport: "mtb", en: "MTB routes", nl: "MTB-routes" },
  { key: "gravel", gravel: true, plannerSport: "gravel", trailsSport: "gravel", en: "Gravel routes", nl: "Gravelroutes" },
];

export function resolveActivity(slug: string): Activity | null {
  return ACTIVITIES.find((a) => a.key === slug) ?? null;
}

export type Country = { iso: string; slug: string; en: string; nl: string };

// Countries that appear in the trail data (2026-08). Canonical English slug,
// shared across locales; localized display names.
export const COUNTRIES: Country[] = [
  { iso: "DE", slug: "germany", en: "Germany", nl: "Duitsland" },
  { iso: "NL", slug: "netherlands", en: "the Netherlands", nl: "Nederland" },
  { iso: "ES", slug: "spain", en: "Spain", nl: "Spanje" },
  { iso: "FR", slug: "france", en: "France", nl: "Frankrijk" },
  { iso: "AT", slug: "austria", en: "Austria", nl: "Oostenrijk" },
  { iso: "IT", slug: "italy", en: "Italy", nl: "Italië" },
  { iso: "PL", slug: "poland", en: "Poland", nl: "Polen" },
  { iso: "CZ", slug: "czechia", en: "Czechia", nl: "Tsjechië" },
  { iso: "SE", slug: "sweden", en: "Sweden", nl: "Zweden" },
  { iso: "CH", slug: "switzerland", en: "Switzerland", nl: "Zwitserland" },
  { iso: "GB", slug: "united-kingdom", en: "the United Kingdom", nl: "het Verenigd Koninkrijk" },
  { iso: "HU", slug: "hungary", en: "Hungary", nl: "Hongarije" },
  { iso: "BE", slug: "belgium", en: "Belgium", nl: "België" },
  { iso: "DK", slug: "denmark", en: "Denmark", nl: "Denemarken" },
  { iso: "SI", slug: "slovenia", en: "Slovenia", nl: "Slovenië" },
  { iso: "SK", slug: "slovakia", en: "Slovakia", nl: "Slowakije" },
  { iso: "NO", slug: "norway", en: "Norway", nl: "Noorwegen" },
  { iso: "HR", slug: "croatia", en: "Croatia", nl: "Kroatië" },
  { iso: "PT", slug: "portugal", en: "Portugal", nl: "Portugal" },
  { iso: "LV", slug: "latvia", en: "Latvia", nl: "Letland" },
  { iso: "EE", slug: "estonia", en: "Estonia", nl: "Estland" },
  { iso: "FI", slug: "finland", en: "Finland", nl: "Finland" },
  { iso: "RO", slug: "romania", en: "Romania", nl: "Roemenië" },
  { iso: "IE", slug: "ireland", en: "Ireland", nl: "Ierland" },
  { iso: "BG", slug: "bulgaria", en: "Bulgaria", nl: "Bulgarije" },
  { iso: "LU", slug: "luxembourg", en: "Luxembourg", nl: "Luxemburg" },
  { iso: "LT", slug: "lithuania", en: "Lithuania", nl: "Litouwen" },
  { iso: "GR", slug: "greece", en: "Greece", nl: "Griekenland" },
];

const BY_SLUG = new Map(COUNTRIES.map((c) => [c.slug, c]));
export function resolveCountry(slug: string): Country | null {
  return BY_SLUG.get(slug) ?? null;
}

/** Thin-content gate: a combo needs at least this many real routes to get a page. */
export const MIN_TRAILS = 25;

type CountFacet = { hike: number; touring: number; mtb: number; gravel: number };
type Agg = {
  countries: Record<string, CountFacet>; // [iso]
  regions: Record<string, Record<string, CountFacet>>; // [iso][regionName]
};

const facetFor = (a: Activity, f: CountFacet) => (a.gravel ? f.gravel : f[a.sport!]);
const addRow = (f: CountFacet, sport: string, gravel: boolean) => {
  if (sport === "hike") f.hike++;
  else if (sport === "touring") f.touring++;
  else if (sport === "mtb") f.mtb++;
  if (gravel) f.gravel++;
};

// Aggregate trail counts per country and per (country, region) per activity.
// Paged plain PostgREST fetch (build-safe — no cookies); cached 1h. PostgREST
// caps at 1000 rows/request.
const cache = { data: null as Agg | null, at: 0 };
async function facets(): Promise<Agg> {
  if (cache.data && Date.now() - cache.at < 3_600_000) return cache.data;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const agg: Agg = { countries: {}, regions: {} };
  if (!base || !key) return agg;
  const PAGE = 1000;
  try {
    for (let offset = 0; offset < 80_000; offset += PAGE) {
      const res = await fetch(
        `${base}/rest/v1/trails?select=country,region,sport,is_gravel&limit=${PAGE}&offset=${offset}`,
        { headers: { apikey: key }, next: { revalidate: 3600, tags: ["trails"] } },
      );
      if (!res.ok) break;
      const rows = (await res.json()) as {
        country: string | null;
        region: string | null;
        sport: "hike" | "touring" | "mtb";
        is_gravel: boolean;
      }[];
      for (const r of rows) {
        if (!r.country) continue;
        addRow((agg.countries[r.country] ??= { hike: 0, touring: 0, mtb: 0, gravel: 0 }), r.sport, r.is_gravel);
        if (r.region) {
          const cr = (agg.regions[r.country] ??= {});
          addRow((cr[r.region] ??= { hike: 0, touring: 0, mtb: 0, gravel: 0 }), r.sport, r.is_gravel);
        }
      }
      if (rows.length < PAGE) break;
    }
  } catch {
    /* fall through with whatever we have */
  }
  cache.data = agg;
  cache.at = Date.now();
  return agg;
}

export type Combo = { activity: Activity; country: Country; count: number };

/** All activity × country combos that pass the thin-content gate. */
export async function gatedCombos(): Promise<Combo[]> {
  const { countries } = await facets();
  const out: Combo[] = [];
  for (const country of COUNTRIES) {
    const c = countries[country.iso];
    if (!c) continue;
    for (const activity of ACTIVITIES) {
      const n = facetFor(activity, c);
      if (n >= MIN_TRAILS) out.push({ activity, country, count: n });
    }
  }
  return out;
}

/** Count for one activity × country combo (page's own gate check). */
export async function comboCount(activity: Activity, country: Country): Promise<number> {
  const { countries } = await facets();
  const c = countries[country.iso];
  return c ? facetFor(activity, c) : 0;
}

export type RegionCombo = {
  activity: Activity;
  country: Country;
  region: string; // OSM region name (no localized form)
  slug: string;
  count: number;
};

/** All activity × country × region combos that pass the gate. */
export async function gatedRegionCombos(): Promise<RegionCombo[]> {
  const { regions } = await facets();
  const out: RegionCombo[] = [];
  for (const country of COUNTRIES) {
    const cr = regions[country.iso];
    if (!cr) continue;
    for (const activity of ACTIVITIES) {
      const seen = new Set<string>(); // slug collisions within a country/activity: first wins
      for (const [region, f] of Object.entries(cr)) {
        const n = facetFor(activity, f);
        if (n < MIN_TRAILS) continue;
        const slug = slugify(region);
        if (!slug || seen.has(slug)) continue;
        seen.add(slug);
        out.push({ activity, country, region, slug, count: n });
      }
    }
  }
  return out;
}

export async function regionCombo(
  activity: Activity,
  country: Country,
  regionSlug: string,
): Promise<RegionCombo | null> {
  const combos = await gatedRegionCombos();
  return (
    combos.find(
      (c) =>
        c.activity.key === activity.key &&
        c.country.iso === country.iso &&
        c.slug === regionSlug,
    ) ?? null
  );
}

/** Gated region pages for one activity × country (for the country page's list). */
export async function regionsForCountryActivity(
  activity: Activity,
  country: Country,
): Promise<RegionCombo[]> {
  const combos = await gatedRegionCombos();
  return combos
    .filter((c) => c.activity.key === activity.key && c.country.iso === country.iso)
    .sort((a, b) => b.count - a.count);
}
