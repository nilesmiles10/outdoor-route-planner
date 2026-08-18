import { slugify } from "@/lib/slug";
import { regionSlugFor } from "@/lib/regionSlug";

// ─────────────────────────────────────────────────────────────────────────────
// Gedeelde datalaag voor de /trails/<regio>-landingspagina's.
//
// Eén bron voor: de drempel, de slug-resolutie én het zichtbaarheidsfilter.
// De pagina, de sitemap en de crosslinks lezen hier allemaal uit, zodat ze
// niet uit elkaar kunnen lopen (dat is precies hoe /discover/<regio>/<cat>
// ooit drie kopieën van dezelfde sluglogica kreeg — zie lib/regionSlug.ts).
//
// DREMPEL — anti-doorway. Gemeten op 2026-08-18 over de zichtbare trails:
//   n >= 5  → 533 regio's
//   n >= 8  → 443 regio's, 28.945 van 30.158 trails (96,0%)
//   n >= 12 → 367 regio's, 28.234 (93,6%)
// 8 gekozen: gelijk aan de bestaande poort voor /discover/<regio>/<categorie>
// (consistent toepassen, niet per pagina-type een andere drempel verzinnen) en
// het beste evenwicht — 443 pagina's is een kleine, verdedigbare index die
// toch 96% van de routes een geografische ouder geeft. Onder de drempel wordt
// er GEEN pagina gegenereerd (404), niet een dunne noindex-variant.
export const MIN_TRAILS_PER_REGION = 8;

// Cap op de getoonde lijst. Grootste regio zit ruim onder 1000 (PostgREST
// max-rows), maar expliciet cappen houdt de HTML hanteerbaar; bij een hit
// tonen we een eerlijke "x van y"-hint i.p.v. stil af te kappen.
export const TRAIL_LIST_LIMIT = 300;

const REST = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1`;
const HEADERS = { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! };

// Plain anon-fetch, geen supabaseServer(): die roept cookies() aan en haalt de
// route uit de cache — hetzelfde wat trail-pagina's ooit bij elke crawler-hit
// liet herrenderen. Anon betekent ook dat RLS geldt: trails_select verbergt
// hidden_at-rijen, en trail_regions draait met security_invoker.
async function rest<T>(path: string): Promise<T[]> {
  // Gooien i.p.v. [] teruggeven bij een infra-fout: een lege uitkomst wordt
  // verderop als "regio bestaat niet" gelezen → notFound(), en die 404 wordt
  // mét revalidate gecacht. Eén Supabase-blip zou een geldige regiopagina dan
  // tot een uur op 404 vastzetten. Een throw laat Next niets cachen en geeft
  // een 5xx ("tijdelijk weg", Google retryt) i.p.v. 404 ("bestaat niet").
  const res = await fetch(`${REST}/${path}`, {
    headers: HEADERS,
    next: { revalidate: 3600, tags: ["trails"] },
  });
  if (!res.ok) throw new Error(`trails REST ${res.status} on ${path}`);
  return (await res.json()) as T[];
}

export type TrailRegionRow = { region: string; country: string | null; n: number };
export type TrailRegion = TrailRegionRow & { slug: string; label: string };

/**
 * Alle regio's die de drempel halen, mét definitieve slug.
 *
 * Regionamen zijn niet uniek over landen heen (Limburg NL/BE, Jura CH/FR,
 * Luxembourg BE/LU — geverifieerd: exact deze drie botsen in de trail-data).
 * Botsers krijgen een land-suffix via de bestaande regionSlugFor(); unieke
 * namen houden hun kale slug. De botsing wordt bepaald bínnen de verzameling
 * die de drempel haalt: haalt alleen het Belgische Limburg de poort, dan valt
 * er niets te verwarren en blijft de slug kaal.
 */
export async function trailRegions(): Promise<TrailRegion[]> {
  const rows = await rest<TrailRegionRow>(
    `trail_regions?select=region,country,n&n=gte.${MIN_TRAILS_PER_REGION}&order=region&limit=1000`,
  );
  const perName = new Map<string, number>();
  for (const r of rows) perName.set(r.region, (perName.get(r.region) ?? 0) + 1);
  return rows.map((r) => {
    const ambiguous = (perName.get(r.region) ?? 1) > 1;
    return {
      ...r,
      slug: regionSlugFor(r.region, r.country, ambiguous),
      label: ambiguous && r.country ? `${r.region} (${r.country})` : r.region,
    };
  });
}

export type TrailListItem = {
  id: string;
  name: string;
  sport: "hike" | "touring" | "mtb";
  roundtrip: boolean;
  is_gravel: boolean;
  stats: { distanceM: number; timeS: number; ascendM: number };
};

/** Resolveert een URL-slug naar zijn regio + routes, of null als hij niet bestaat. */
export async function resolveTrailRegion(slug: string): Promise<
  (TrailRegion & { items: TrailListItem[] }) | null
> {
  const match = (await trailRegions()).find((r) => r.slug === slug);
  if (!match) return null;
  const q = new URLSearchParams({
    select: "id,name,sport,roundtrip,is_gravel,stats",
    region: `eq.${match.region}`,
    order: "name_sort.asc",
    limit: String(TRAIL_LIST_LIMIT),
  });
  // country kan null zijn; dan niet filteren (de regionaam is dan uniek).
  if (match.country) q.set("country", `eq.${match.country}`);
  const items = await rest<TrailListItem>(`trails?${q.toString()}`);
  return { ...match, items };
}

/** Slug voor een trail-regio, of null als die regio de drempel niet haalt. */
export async function trailRegionSlug(
  region: string | null,
  country: string | null,
): Promise<string | null> {
  if (!region) return null;
  const all = await trailRegions();
  const hit = all.find(
    (r) => r.region === region && (country ? r.country === country : true),
  );
  return hit?.slug ?? null;
}

/** Alleen voor tests/debug: de kale slugify zonder botsingsafhandeling. */
export const baseSlug = slugify;
