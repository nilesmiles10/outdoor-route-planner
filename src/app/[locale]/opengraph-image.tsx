import { OG_SIZE, siteOgCard } from "@/lib/og/routeCard";
import { getSiteSettings } from "@/lib/siteSettings";

export const runtime = "nodejs";
export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "Tarnoo";

// Merk-OG-afbeelding voor de homepage én — via Next's segment-overerving — voor
// elke pagina onder [locale] zonder eigen opengraph-image (regio-categorie,
// profiel, discover, trails-lijst…). Tour/trail/highlight/collection hebben hun
// eigen route-preview en overschrijven deze. Zónder dit had de meest-gedeelde
// URL (tarnoo.com) geen preview-afbeelding.
export default async function OgImage({
  params,
}: {
  params: { locale: string };
}) {
  const s = await getSiteSettings();
  const tagline = params.locale === "en" ? s.tagline_en : s.tagline_nl;
  return siteOgCard(tagline);
}
