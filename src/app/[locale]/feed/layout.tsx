import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getSiteSettings, pageTitle } from "@/lib/siteSettings";

// Client-page → eigen titel via deze server-layout.
export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const t = await getTranslations({ locale: params.locale, namespace: "feed" });
  return {
    title: pageTitle(await getSiteSettings(), t("title")),
    // Persoonlijke, auth-gated pagina: anoniem toont hij alleen een lege staat
    // met een inlogprompt. Zo'n pagina hoort niet in de index — hij staat niet
    // in de sitemap, maar was wel indexeerbaar via interne header-links.
    // follow blijft aan (net als /embed): de header-links mogen gevolgd worden.
    robots: { index: false, follow: true },
  };
}

export default function FeedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
