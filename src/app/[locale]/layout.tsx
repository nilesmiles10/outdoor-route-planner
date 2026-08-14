import type { Metadata } from "next";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import AppHeader from "@/components/AppHeader";
import { SiteSettingsProvider } from "@/components/SiteSettingsProvider";
import { getFooterPages, getSiteSettings, tagline } from "@/lib/siteSettings";
import { SITE_URL } from "@/app/sitemap";
import "../globals.css";

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const s = await getSiteSettings();
  const desc = tagline(s, params.locale);
  return {
    metadataBase: new URL(SITE_URL),
    title: s.site_name,
    description: desc,
    alternates: { languages: { nl: "/nl", en: "/en" } },
    openGraph: {
      siteName: s.site_name,
      title: s.site_name,
      description: desc,
      ...(s.og_image_url ? { images: [s.og_image_url] } : {}),
    },
    twitter: { card: s.og_image_url ? "summary_large_image" : "summary" },
    ...(s.google_site_verification
      ? { verification: { google: s.google_site_verification } }
      : {}),
  };
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  const { locale } = params;
  if (!hasLocale(routing.locales, locale)) notFound();
  // Without this next-intl reads headers and every locale route becomes
  // dynamic — no output caching, so each crawler hit re-renders.
  setRequestLocale(locale);
  const [settings, footerPages] = await Promise.all([
    getSiteSettings(),
    getFooterPages(),
  ]);

  return (
    <html lang={locale}>
      <body className="antialiased">
        {/* Zet vroeg DNS + TLS op naar de kaart-tegel-host. MapLibre haalt de
            style én de vector-tiles van tiles.openfreemap.org; de connectie-
            setup was een merkbaar deel van de trage eerste kaartweergave. Deze
            preconnect scheelt die round-trips op élke kaart (planner/tour/
            trail). crossOrigin omdat de tiles met CORS worden opgehaald. */}
        <link
          rel="preconnect"
          href="https://tiles.openfreemap.org"
          crossOrigin="anonymous"
        />
        <NextIntlClientProvider>
          <SiteSettingsProvider value={{ ...settings, footer_pages: footerPages }}>
            <AppHeader />
            {children}
          </SiteSettingsProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
