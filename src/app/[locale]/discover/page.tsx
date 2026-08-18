import DiscoverClient, { type Row } from "./DiscoverClient";

// Server-wrapper om de discover-hub. Reden: de publieke routes werden alleen
// in een useEffect opgehaald, dus de geleverde HTML bevatte nul route-links —
// de 21 publieke routes waren enkel via de sitemap bereikbaar (orphan pages).
//
// Alleen de lijst wordt server-side voorgeladen. Filters, sortering en
// geolocatie blijven client-side: die zijn per bezoeker en zouden een gecachte
// server-render juist onbruikbaar maken.
export const revalidate = 3600;

const SELECT = "id,name,sport,stats,waypoints,thumb_coords";

// `path` bevat bewust de tabelnaam én de filters, zodat ze in de bron naast
// elkaar staan. Dat is niet cosmetisch: de visibility-guard scant de bron, en
// een URL die via een losse REST-constante wordt samengesteld is voor die scan
// onzichtbaar — dan bewaakt hij deze query niet.
async function rows(path: string): Promise<Row[]> {
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${path}`, {
      headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! },
      next: { revalidate: 3600, tags: ["tours"] },
    });
    if (!res.ok) return [];
    return (await res.json()) as Row[];
  } catch {
    // Geen throw: /discover is een bestaande geïndexeerde hub die bij een
    // Supabase-blip niet mag omvallen. De client-component haalt de lijst
    // alsnog op; alleen de SSR-versie ontbreekt dan even.
    return [];
  }
}

export default async function DiscoverPage() {
  const [initialRows, initialFeatured] = await Promise.all([
    rows(
      `tours?select=${SELECT}&visibility=eq.public&kind=eq.planned&order=created_at.desc&limit=100`,
    ),
    rows(
      `tours?select=${SELECT}&visibility=eq.public&featured_at=not.is.null&order=featured_at.desc&limit=10`,
    ),
  ]);
  return (
    <DiscoverClient initialRows={initialRows} initialFeatured={initialFeatured} />
  );
}
