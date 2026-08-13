"use client";

import { useTranslations } from "next-intl";
import { GRADE_BANDS } from "./ElevationChart";

// Legenda bij het steilheids-gekleurde hoogteprofiel (zie ElevationChart).
// Zonder key waren de kleuren op de lijn een raadsel; deze rij verklaart de
// koel→warm-schaal. Deelt GRADE_BANDS met de grafiek → kan nooit uit de pas
// lopen. title/cursor-help volgt het bestaande tooltip-patroon (title=).
export default function GradeLegend() {
  const t = useTranslations("planner.grade");
  return (
    <div
      className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-neutral-500"
      title={t("tooltip")}
    >
      <span className="cursor-help font-medium text-neutral-600">{t("label")}</span>
      {GRADE_BANDS.map((b) => (
        <span key={b.label} className="flex items-center gap-1">
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: b.color }}
          />
          {b.label}
        </span>
      ))}
    </div>
  );
}
