import CollectionsClient, { type Coll } from "./CollectionsClient";
import { getTranslations } from "next-intl/server";
import { SITE_URL } from "@/app/sitemap";

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

export default async function CollectionsPage({
  params,
}: {
  params: { locale: string };
}) {
  const initialPublic = await publicCollections();
  const t = await getTranslations({
    locale: params.locale,
    namespace: "collections",
  });
  // Alleen collecties met minstens één zichtbare route: precies de set die de
  // hub als "Ontdekken" toont en die in de sitemap staat. Een lege collectie is
  // noindex, dus die hoort ook niet in de gestructureerde data.
  const ldItems = initialPublic.filter((c) =>
    c.collection_items.some((i) => i.tours != null),
  );
  return (
    <>
      {ldItems.length > 0 && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "ItemList",
              name: t("title"),
              numberOfItems: ldItems.length,
              itemListElement: ldItems.map((c, i) => ({
                "@type": "ListItem",
                position: i + 1,
                name: c.title,
                url: `${SITE_URL}/${params.locale}/collection/${c.id}`,
              })),
            }),
          }}
        />
      )}
      <CollectionsClient initialPublic={initialPublic} />
    </>
  );
}
