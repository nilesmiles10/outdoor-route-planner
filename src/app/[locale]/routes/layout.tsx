import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getSiteSettings, pageTitle } from "@/lib/siteSettings";

// Client-page → eigen titel via deze server-layout. Let op: de messages-
// namespace voor /routes heet "routesPage".
export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const t = await getTranslations({
    locale: params.locale,
    namespace: "routesPage",
  });
  return {
    title: pageTitle(await getSiteSettings(), t("title")),
    // "Mijn routes" is auth-gated: anoniem levert hij letterlijk "Log in om je
    // opgeslagen routes te zien" plus een inlogformulier. Geen zoekresultaat
    // waard, en met een bezittelijke titel ook misleidend in de SERP.
    robots: { index: false, follow: true },
  };
}

export default function RoutesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
