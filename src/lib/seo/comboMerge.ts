// Pure merge-logica voor de regio×categorie-chips op /discover.
//
// Apart van discoverCombos.ts (dat fetcht) zodat zowel de server-wrapper als de
// client-component 'm kan importeren zonder fetch-code mee te bundelen. De
// server merget nu vóór het doorgeven, zodat er 60 chips over de draad gaan
// i.p.v. alle 230 — de client rendert er toch nooit meer dan MAX_CHIPS.
//
// De functie is idempotent: 'm nog eens draaien over een al gemergede lijst
// geeft dezelfde uitkomst. Dat is met opzet — de client draait 'm hoe dan ook,
// ook over server-data die al gemerged is.

// 3.614 combo's halen de ≥8-poort — als chiprij onbruikbaar. De rijkste eerst;
// de rest blijft bereikbaar via de sitemap en de links op de regiopagina's.
export const MAX_CHIPS = 60;

// Nederlandstalige bezoekers zijn vrijwel altijd op zoek naar Benelux-regio's;
// de globale top-200 is puur bergland (DE/AT/ES/IT). Voor nl zetten we daarom de
// Benelux-combo's vooraan. Andere locales houden de globale volgorde.
const BENELUX = new Set(["NL", "BE", "LU"]);

export type ComboLike = {
  slug: string;
  label: string;
  category: string;
  n: number;
  country?: string | null;
};

export function mergeCombosForLocale<T extends ComboLike>(
  combos: T[],
  locale: string,
): { comboList: T[]; beCount: number } {
  if (locale !== "nl") return { comboList: combos.slice(0, MAX_CHIPS), beCount: 0 };
  const be: T[] = [];
  const rest: T[] = [];
  for (const c of combos) (c.country && BENELUX.has(c.country) ? be : rest).push(c);
  const merged = [...be, ...rest].slice(0, MAX_CHIPS);
  const beShown = merged.filter((c) => c.country && BENELUX.has(c.country)).length;
  return { comboList: merged, beCount: beShown };
}
