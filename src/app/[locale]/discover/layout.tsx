import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { entityMetadata } from "@/lib/seo/entityMetadata";

// De discover-page is een client-component en kan zelf geen generateMetadata
// exporteren; deze server-layout geeft de route een eigen titel/omschrijving
// (voorheen erfde hij de generieke "Tarnoo" van de locale-layout).
export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const t = await getTranslations({
    locale: params.locale,
    namespace: "discover",
  });
  // Canonical naar de kale route: de filters (sport/afstand/moeilijkheid/sort/
  // rondje) zitten in query-params en zouden anders tientallen dunne duplicaat-
  // URL's opleveren. Zo consolideert alles naar /<locale>/discover.
  //
  // Eigen OG i.p.v. de geërfde site-OG: een gedeelde link naar deze hub toonde
  // "Tarnoo" / "Plan je volgende avontuur" i.p.v. waar de pagina over gaat.
  // ogImage expliciet, want door openGraph te zetten vervalt de geërfde
  // site-afbeelding.
  return entityMetadata({
    locale: params.locale,
    path: "discover",
    title: t("title"),
    description: t("subtitle"),
    ogImage: `/${params.locale}/opengraph-image`,
  });
}

export default function DiscoverLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
