// URL slugs for region names ("Oost-Vlaanderen" → "oost-vlaanderen",
// "Liège" → "liege"). Reversible only via lookup against known regions.
export function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
