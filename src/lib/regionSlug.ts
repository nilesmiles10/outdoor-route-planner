import { slugify } from "@/lib/slug";

// Eén bron voor de /discover/<regio>/<categorie>-slugs. Stond in drie kopieën
// (sitemap, regiopagina resolve(), /discover-chips) en de derde was fout: die
// sloeg de land-suffix over, dus de chips linkten naar /discover/limburg/...
// dat sinds de ontdubbeling bewust 404't.
//
// Regionamen zijn niet uniek over landen heen: Limburg (NL/BE), Luxembourg
// (BE/LU) en Jura (CH/FR) bestaan dubbel. Botsende namen krijgen een
// land-suffix ("limburg-nl"); unieke namen houden hun kale slug.
//
// De botsing wordt PER CATEGORIE bepaald, niet globaal: als alleen de
// Belgische Limburg genoeg watertjes heeft om de ≥8-poort te halen, is er
// binnen die categorie niets om mee te botsen en blijft de slug kaal.

export type RegionCombo = {
  region: string;
  country: string | null;
  category: string;
  n: number;
};

export function regionSlugFor(
  region: string,
  country: string | null,
  ambiguous: boolean,
): string {
  const base = slugify(region);
  return ambiguous && country ? `${base}-${country.toLowerCase()}` : base;
}

/** Verrijkt combo-rijen met hun definitieve slug + weergavelabel. */
export function withRegionSlugs<T extends RegionCombo>(
  rows: T[],
): (T & { slug: string; label: string; ambiguous: boolean })[] {
  const perNamePerCat = new Map<string, number>();
  for (const r of rows) {
    const k = `${r.region}|${r.category}`;
    perNamePerCat.set(k, (perNamePerCat.get(k) ?? 0) + 1);
  }
  return rows.map((r) => {
    const ambiguous = (perNamePerCat.get(`${r.region}|${r.category}`) ?? 1) > 1;
    return {
      ...r,
      ambiguous,
      slug: regionSlugFor(r.region, r.country, ambiguous),
      label: ambiguous && r.country ? `${r.region} (${r.country})` : r.region,
    };
  });
}
