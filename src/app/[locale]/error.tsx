"use client";

import { useEffect } from "react";
import { useLocale, useTranslations } from "next-intl";

// Runtime error-boundary voor het [locale]-segment. Zonder deze toonde een
// throw in een pagina Next.js' kale default-error (in prod: ongestileerde
// "Application error", geen nav, geen weg terug). Rendert binnen de locale-
// layout, dus mét header + i18n-context, en biedt "opnieuw proberen" (reset)
// + een weg terug.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("errorPage");
  const locale = useLocale();

  useEffect(() => {
    // Log naar de console zodat de fout niet stil verdwijnt achter de UI.
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-5xl">⚠️</p>
      <h1 className="text-xl font-semibold text-neutral-900">{t("title")}</h1>
      <p className="text-sm text-neutral-500">{t("message")}</p>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => reset()}
          className="rounded-full bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
        >
          {t("retry")}
        </button>
        <a
          href={`/${locale}`}
          className="rounded-full border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
        >
          {t("home")}
        </a>
      </div>
    </main>
  );
}
