import { withRegionSlugs, type RegionCombo } from "@/lib/regionSlug";

// De regio×categorie-chips op /discover komen uit de gegroepeerde view
// `highlight_regions`, die over 500k highlights aggregeert. Dat kost ~2s per
// pagina van 1000 rijen en er zijn er 3.6k boven de ≥8-poort: acht seconden
// Postgres-werk. Dat mag niet per bezoeker gebeuren — vandaar de caching op
// revalidate 3600.
//
// Deze logica stond in /api/discover/combos/route.ts. Uitgefactoreerd zodat de
// server-wrapper van /discover dezelfde combo's kan voorladen (de chips zijn
// links naar 3.6k indexeerbare regiopagina's en hoorden in de HTML te staan) —
// zonder de query te dupliceren. Een tweede kopie zou onvermijdelijk uit elkaar
// lopen; dat is precies waarom lib/regionSlug.ts ooit is ontstaan.
//
// ⚠ Niet sorteren op n in de query: `order=n.desc` dwingt een volledige
// aggregatie + sort over 500k rijen af en loopt in een statement timeout (500).
// Sorteren op region is goedkoop; op aantal sorteren we in JS, nadat alle
// rijen binnen zijn (die hebben we toch nodig — zie hieronder).
//
// Alle rijen ophalen is geen luxe: of een regionaam een land-suffix nodig heeft
// ("limburg-nl") hangt af van álle regio's met dezelfde naam die de poort
// halen. Een top-N-selectie zou die botsing kunnen missen en linken naar een
// slug die 404't.

const MIN_ITEMS = 8;
const PAGE = 1000;

export type DiscoverCombo = {
  slug: string;
  label: string;
  category: string;
  n: number;
  country: string | null;
};

// Eén hapering tijdens het genereren betekende een uur lang een lege chiprij
// (precies wat er bij de eerste deploy gebeurde: de aggregatie duurde toen
// 3,1s tegen een anon statement_timeout van 3s). Vandaar één herkansing per
// pagina — de index maakt de query nu ~0,5s, dus dit is de vangnetlaag.
async function fetchPage(offset: number): Promise<RegionCombo[] | null> {
  const url =
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/highlight_regions` +
    `?select=region,country,category,n&n=gte.${MIN_ITEMS}` +
    `&order=region&limit=${PAGE}&offset=${offset}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! },
        next: { revalidate: 3600, tags: ["highlights"] },
      });
      if (res.ok) return (await res.json()) as RegionCombo[];
      console.warn(`combos: page ${offset} gaf ${res.status} (poging ${attempt + 1})`);
    } catch (e) {
      console.warn(`combos: page ${offset} faalde (poging ${attempt + 1})`, e);
    }
  }
  return null;
}

export async function discoverCombos(): Promise<DiscoverCombo[]> {
  const rows: RegionCombo[] = [];
  for (let offset = 0; offset < 20_000; offset += PAGE) {
    const page = await fetchPage(offset);
    // Doorgaan met een gat zou stilletjes verkeerde slugs geven (een botsende
    // regionaam kan in de ontbrekende pagina zitten), dus liever afbreken.
    if (!page) break;
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  if (rows.length === 0) return [];

  // Slugs worden over de VOLLEDIGE set bepaald (botsingen!), pas daarna kappen
  // we af: alle 3.6k combo's uitsturen is ~220 kB voor een rij van 60 chips.
  // De rest is niet verloren — die staat in de sitemap en op de regiopagina's.
  const withSlugs = withRegionSlugs(rows);
  const toOut = (c: (typeof withSlugs)[number]): DiscoverCombo => ({
    slug: c.slug,
    label: c.label,
    category: c.category,
    n: c.n,
    country: c.country,
  });
  const global = [...withSlugs].sort((a, b) => b.n - a.n).slice(0, 200);
  // Benelux-combo's halen de globale top-200 niet (de rijkste — Luik/monument
  // met n≈449 — zit onder de 200e plek, ≈497). Voor de NL/BE-doelgroep zijn ze
  // juist de relevantste "ontdek per regio"-instap. Voeg de top-30 Benelux toe
  // zodat de client ze voor de nl-locale vooraan kan zetten; de globale volgorde
  // (en dus het gedrag voor andere locales) blijft ongewijzigd — ze komen er
  // enkel achteraan bij. `country` gaat mee zodat de client kan filteren.
  const BENELUX = new Set(["NL", "BE", "LU"]);
  const benelux = [...withSlugs]
    .filter((c) => c.country && BENELUX.has(c.country))
    .sort((a, b) => b.n - a.n)
    .slice(0, 30);
  const seen = new Set<string>();
  return [...global, ...benelux]
    .filter((c) => {
      const k = `${c.slug}|${c.category}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .map(toOut);
}
