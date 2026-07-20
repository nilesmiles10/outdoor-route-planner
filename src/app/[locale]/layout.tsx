import type { Metadata } from "next";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import AppHeader from "@/components/AppHeader";
import { SiteSettingsProvider } from "@/components/SiteSettingsProvider";
import { getSiteSettings, tagline } from "@/lib/siteSettings";
import "../globals.css";

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const s = await getSiteSettings();
  return { title: s.site_name, description: tagline(s, params.locale) };
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
  const settings = await getSiteSettings();

  return (
    <html lang={locale}>
      <body className="antialiased">
        <NextIntlClientProvider>
          <SiteSettingsProvider value={settings}>
            <AppHeader />
            {children}
          </SiteSettingsProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
