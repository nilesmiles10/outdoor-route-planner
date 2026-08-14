import type { getTranslations } from "next-intl/server";
import { difficulty } from "@/lib/difficulty";

// Menselijk-leesbare één-zin-omschrijving van een route: moeilijkheid +
// ondergrond, bv. "Zware route. Zeer goede conditie vereist. Grotendeels
// verharde wegen." Gebruikt op de tour- én trail-detailpagina (en in hun
// meta-description). Vertaalsleutels leven onder de `tourPage.autoDesc`-
// namespace, dus geef een `getTranslations("tourPage")`-vertaler mee.
type AutoDescInput = {
  sport: string;
  stats: { distanceM: number; ascendM: number };
  surfaces: { buckets: { paved: number; unpaved: number; unknown: number } };
};

export function buildAutoDesc(
  t: Awaited<ReturnType<typeof getTranslations>>,
  route: AutoDescInput,
): string {
  const diff = difficulty(route.sport, route.stats.distanceM, route.stats.ascendM);
  const b = route.surfaces.buckets;
  const total = b.paved + b.unpaved + b.unknown;
  const surfKey =
    total === 0
      ? "mixed"
      : b.paved / total >= 0.7
        ? "paved"
        : b.unpaved / total >= 0.7
          ? "unpaved"
          : "mixed";
  return `${t(`autoDesc.${diff}` as never)} ${t(`autoDesc.${surfKey}` as never)}`;
}
