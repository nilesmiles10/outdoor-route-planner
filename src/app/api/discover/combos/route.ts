import { NextResponse } from "next/server";
import { withRegionSlugs, type RegionCombo } from "@/lib/regionSlug";

// De regio×categorie-chips op /discover komen uit de gegroepeerde view
// `highlight_regions`, die over 500k highlights aggregeert. Dat kost ~2s per
// pagina van 1000 rijen en er zijn er 3.6k boven de ≥8-poort: acht seconden
// Postgres-werk. Dat mag niet per bezoeker gebeuren — vandaar deze route, die
// Next één keer per uur ververst en daarna uit cache serveert.
//
// ⚠ Niet sorteren op n in de query: `order=n.desc` dwingt een volledige
// aggregatie + sort over 500k rijen af en loopt in een statement timeout (500).
// Sorteren op region is goedkoop; op aantal sorteren we hier in JS, nadat alle
// rijen binnen zijn (die hebben we toch nodig — zie hieronder).
//
// Alle rijen ophalen is geen luxe: of een regionaam een land-suffix nodig heeft
// ("limburg-nl") hangt af van álle regio's met dezelfde naam die de poort
// halen. Een top-N-selectie zou die botsing kunnen missen en linken naar een
// slug die 404't.

export const revalidate = 3600;

const MIN_ITEMS = 8;
const PAGE = 1000;

export async function GET() {
  const rows: RegionCombo[] = [];
  try {
    for (let offset = 0; offset < 20_000; offset += PAGE) {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/highlight_regions` +
          `?select=region,country,category,n&n=gte.${MIN_ITEMS}` +
          `&order=region&limit=${PAGE}&offset=${offset}`,
        {
          headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! },
          next: { revalidate: 3600, tags: ["highlights"] },
        },
      );
      if (!res.ok) break;
      const page = (await res.json()) as RegionCombo[];
      rows.push(...page);
      if (page.length < PAGE) break;
    }
  } catch {
    // Liever een lege chiprij dan een kapotte /discover.
    return NextResponse.json([]);
  }

  // Slugs worden over de VOLLEDIGE set bepaald (botsingen!), pas daarna kappen
  // we af: alle 3.6k combo's uitsturen is ~220 kB voor een rij van 60 chips.
  // De rest is niet verloren — die staat in de sitemap en op de regiopagina's.
  const combos = withRegionSlugs(rows)
    .sort((a, b) => b.n - a.n)
    .slice(0, 200)
    .map(({ slug, label, category, n }) => ({ slug, label, category, n }));

  return NextResponse.json(combos);
}
