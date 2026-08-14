"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

// Herbruikbare deel-knop: op touch-apparaten de native share-sheet (Web Share
// API), op desktop kopiëren naar het klembord met "Copied!".
// LET OP: navigator.share bestaat óók op desktop Chrome/Edge, dus alléén dáárop
// gaten liet desktop-gebruikers de logge OS-share-sheet zien i.p.v. de bedoelde
// kopieer-flow met "Gekopieerd!"-feedback. Daarom gaten op de primaire pointer:
// (pointer: coarse) = touch-eerst (telefoon/tablet) → native; fijne pointer
// (muis) → kopiëren.
// Klembord bewust optimistisch (niet-awaited) — writeText faalt alleen zonder
// user-activation, wat bij een echte klik niet gebeurt.
export default function ShareButton({
  title,
  className,
}: {
  title: string;
  className?: string;
}) {
  const t = useTranslations("planner");
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={async () => {
        const url = window.location.href;
        const touchFirst =
          typeof window.matchMedia === "function" &&
          window.matchMedia("(pointer: coarse)").matches;
        if (navigator.share && touchFirst) {
          try {
            await navigator.share({ title, url });
            return;
          } catch {
            // geannuleerd of mislukt → val terug op kopiëren
          }
        }
        navigator.clipboard?.writeText(url).catch(() => {});
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className={
        className ??
        "rounded-lg bg-neutral-100 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-200"
      }
    >
      {copied ? t("copied") : `↗ ${t("share")}`}
    </button>
  );
}
