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
  return { title: pageTitle(await getSiteSettings(), t("title")) };
}

export default function FeedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
