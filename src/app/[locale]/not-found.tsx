"use client";

import { useLocale, useTranslations } from "next-intl";

// Global not-found voor het [locale]-segment. Zonder deze render'de een
// notFound() (of een onbekende URL zoals /en/onzin) een volledig lege
// witte pagina — geen boodschap, geen navigatie, geen weg terug. Rendert
// binnen de locale-layout, dus mét header + i18n-context.
export default function NotFound() {
  const t = useTranslations("notFound");
  const locale = useLocale();

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-6xl font-bold text-emerald-700">404</p>
      <h1 className="text-xl font-semibold text-neutral-900">{t("title")}</h1>
      <p className="text-sm text-neutral-500">{t("message")}</p>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
        <a
          href={`/${locale}`}
          className="rounded-full bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
        >
          {t("home")}
        </a>
        <a
          href={`/${locale}/discover`}
          className="rounded-full border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
        >
          {t("discover")}
        </a>
      </div>
    </main>
  );
}
