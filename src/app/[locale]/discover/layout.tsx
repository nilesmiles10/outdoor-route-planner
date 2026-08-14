import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getSiteSettings, pageTitle } from "@/lib/siteSettings";

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
  return {
    title: pageTitle(await getSiteSettings(), t("title")),
    description: t("subtitle"),
    // Canonical naar de kale route: de filters (sport/afstand/moeilijkheid/sort/
    // rondje) zitten in query-params en zouden anders tientallen dunne duplicaat-
    // URL's opleveren. Zo consolideert alles naar /<locale>/discover.
    alternates: { canonical: `/${params.locale}/discover` },
  };
}

export default function DiscoverLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
