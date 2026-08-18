// Supabase image-transform URL voor storage-objecten. Een geüploade avatar/foto
// kan 400+ KB zijn; die full-res naar een 40-88px thumbnail sturen is zonde.
// Deze helper vervangt de raw /object/public/-URL door de /render/image/public/-
// variant met width(+height)/quality, zodat Supabase server-side een verkleinde
// versie levert (transforms staan aan op dit project — geverifieerd 2026-08-18:
// 414 KB → 45 KB bij width=176). Externe (niet-Supabase) URLs blijven ongewijzigd.
export function supabaseThumb(
  url: string | null,
  opts: { width: number; height?: number; quality?: number },
): string | null {
  if (!url || !url.includes("/storage/v1/object/public/")) return url;
  const p = new URLSearchParams({
    width: String(opts.width),
    quality: String(opts.quality ?? 75),
  });
  // Alleen bij een expliciete hoogte croppen (cover) — voor vierkante avatars.
  // Zonder hoogte: alleen op breedte schalen, aspect behouden (object-cover in
  // de UI snijdt de rest bij).
  if (opts.height) {
    p.set("height", String(opts.height));
    p.set("resize", "cover");
  }
  return `${url.replace("/object/public/", "/render/image/public/")}?${p}`;
}
