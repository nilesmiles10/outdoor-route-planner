import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getSiteSettings, pageTitle } from "@/lib/siteSettings";

// Client-page → eigen titel/omschrijving via deze server-layout.
export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const t = await getTranslations({
    locale: params.locale,
    namespace: "collections",
  });
  return {
    title: pageTitle(await getSiteSettings(), t("title")),
    description: t("subtitle"),
    // Self-canonical: consolideert tracking-varianten (?utm/?fbclid) naar de
    // schone hub-URL. Stond hier als enige indexeerbare hub nog niet.
    alternates: { canonical: `/${params.locale}/collections` },
  };
}

export default function CollectionsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
