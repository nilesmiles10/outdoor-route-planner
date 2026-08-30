import type { Metadata, Viewport } from "next";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { routing } from "@/i18n/routing";
import AppHeader from "@/components/AppHeader";
import { SiteSettingsProvider } from "@/components/SiteSettingsProvider";
import { getFooterPages, getSiteSettings, tagline } from "@/lib/siteSettings";
import { SITE_URL } from "@/app/sitemap";
import "../globals.css";

// Merk-kleur voor de mobiele browser-chrome (adresbalk/statusbalk) — matcht de
// manifest theme_color en het logo. Alleen themeColor gezet; Next houdt de
// default viewport (width=device-width, initial-scale=1), dus geen effect op
// pinch-zoom of de kaart.
export const viewport: Viewport = {
  themeColor: "#047857",
};

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const s = await getSiteSettings();
  const desc = tagline(s, params.locale);
  // Zoek-snippet: een rijke waardepropositie (sporten + Europa + hoogte/onder-
  // grond + 30k officiële routes) scoort beter dan de kale tagline. De tagline
  // blijft de punchy OG-omschrijving voor social previews.
  const tApp = await getTranslations({ locale: params.locale, namespace: "app" });
  return {
    metadataBase: new URL(SITE_URL),
    title: s.site_name,
    description: tApp("metaDescription"),
    // GEEN alternates.languages hier: die zetten op layout-niveau een STATISCHE
    // hreflang naar de homepage (/nl, /en) op ÉLKE pagina — dus /nl/trail/x
    // claimde dat zijn Engelse variant de homepage is. next-intl's middleware
    // stuurt al correcte, pagina-specifieke hreflang via de HTTP Link-header
    // (en/nl/x-default naar de échte URL); twee tegenstrijdige signalen laten
    // Google hreflang mogelijk negeren. Alleen de Link-header laten staan.
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
        {/* Cookieless, first-party analytics (geen consent-banner nodig).
            Web Analytics = verkeer/gedrag; Speed Insights = Core Web Vitals
            (SEO-signaal). Beide moeten in het Vercel-dashboard aangezet zijn. */}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
