import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { entityMetadata } from "@/lib/seo/entityMetadata";

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
  // Self-canonical consolideert tracking-varianten (?utm/?fbclid) naar de
  // schone hub-URL. Eigen OG i.p.v. de geërfde site-OG: een gedeelde link naar
  // deze hub toonde "Tarnoo" i.p.v. waar de pagina over gaat.
  return entityMetadata({
    locale: params.locale,
    path: "collections",
    title: t("title"),
    description: t("subtitle"),
    ogImage: `/${params.locale}/opengraph-image`,
  });
}

export default function CollectionsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
