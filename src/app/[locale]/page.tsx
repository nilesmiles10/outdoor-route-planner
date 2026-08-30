import type { Metadata } from "next";
import PlannerApp from "@/components/PlannerApp";
import SiteFooter from "@/components/SiteFooter";
import { getSiteSettings } from "@/lib/siteSettings";
import { SITE_URL } from "@/app/sitemap";

// Self-canonical op de schone locale-URL. De planner-homepage draagt allerlei
// query-varianten (?utm/?fbclid van gedeelde links, ?w=/?at= route-share-state)
// — die horen niet als losse pagina's geïndexeerd te worden. Canonical → /nl
// resp. /en consolideert ze naar één URL. Alleen `alternates` gezet, dus de
// titel/omschrijving/OG-afbeelding van de layout blijven ongemoeid.
export function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Metadata {
  return { alternates: { canonical: `/${params.locale}` } };
}

export default async function Home({
  params,
}: {
  params: { locale: string };
}) {
  const settings = await getSiteSettings();
  return (
    <>
      {/* WebSite op de root-URL: dit is het enige plek-onafhankelijke
          site-brede feit dat er is, en Google gebruikt 't voor de sitenaam in
          zoekresultaten. Alleen name + url — allebei echte waarden uit
          site_settings resp. de canonieke host.

          Bewust GEEN SearchAction/sitelinks-searchbox: Google heeft die in 2023
          uitgefaseerd, dus dat zou een functie beschrijven die niet bestaat.
          Bewust ook geen Organization: er is geen adres, oprichtingsdatum of
          social-profiel om 'm mee te vullen, en velden verzinnen om een schema
          te vullen is precies wat we niet doen. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebSite",
            name: settings.site_name,
            url: `${SITE_URL}/${params.locale}`,
          }),
        }}
      />
      <PlannerApp />
      {/* Below-the-fold footer op de planner-homepage: geeft de sterkste pagina
          van de site interne links naar de use-case landingspagina's (die de
          planner-app zelf niet toont). h-dvh planner erboven, dus buiten beeld
          tot je scrollt — geen impact op de app-UX. */}
      <div className="mx-auto max-w-3xl px-4">
        <SiteFooter />
      </div>
    </>
  );
}
