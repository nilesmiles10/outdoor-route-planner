import CollectionsClient, { type Coll } from "./CollectionsClient";

// Server-wrapper om de client-hub. Reden: de publieke collecties werden
// uitsluitend in een useEffect opgehaald, dus de geleverde HTML bevatte nul
// collectie-links — de publieke collecties waren daarmee alleen via de
// sitemap bereikbaar (orphan pages). Nu staan ze in de server-HTML; de
// client-component houdt al het viewer-specifieke werk.
//
// Plain anon-fetch i.p.v. supabaseServer(): die roept cookies() aan en haalt
// de route uit de cache. RLS geldt hier evengoed — collections_select draait
// op can_view_content(), dus anon krijgt alleen publieke rijen. Het expliciete
// visibility=eq.public-filter staat er daarnaast ook, conform de
// visibility-guard voor publieke lijst-oppervlakken.
export const revalidate = 3600;

const SELECT =
  "id,title,intro,owner,visibility,collection_items(tours(sport,stats))";

async function publicCollections(): Promise<Coll[]> {
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/collections` +
        `?select=${SELECT}&visibility=eq.public` +
        `&order=editorial_at.desc.nullslast,updated_at.desc&limit=60`,
      {
        headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! },
        next: { revalidate: 3600, tags: ["collections"] },
      },
    );
    if (!res.ok) return [];
    return (await res.json()) as Coll[];
  } catch {
    // Faalt de fetch, dan rendert de client-component alsnog z'n eigen fetch.
    // Hier géén throw (anders dan bij de trail-regiopagina's): deze hub is een
    // bestaande, geïndexeerde URL die bij een blip niet mag omvallen — de
    // pagina blijft werken, alleen de SSR-lijst ontbreekt dan even.
    return [];
  }
}

export default async function CollectionsPage() {
  return <CollectionsClient initialPublic={await publicCollections()} />;
}
