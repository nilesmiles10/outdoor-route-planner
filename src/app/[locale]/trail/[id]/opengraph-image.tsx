import { getTranslations } from "next-intl/server";
import { supabaseServer } from "@/lib/supabase/server";
import { notFoundOgCard, OG_SIZE, routeOgCard } from "@/lib/og/routeCard";

export const runtime = "nodejs";
export const size = OG_SIZE;
export const contentType = "image/png";

// OG-share-kaart voor officiële trails — trails misten er één, dus gedeelde
// trail-links hadden geen preview-afbeelding. Zelfde route-kaart als de tour.
export default async function OgImage({
  params,
}: {
  params: { id: string; locale: string };
}) {
  const sb = supabaseServer();
  const { data: trail } = await sb
    .from("trails")
    .select("name,sport,geometry,stats,is_gravel")
    .eq("id", params.id)
    .maybeSingle();

  if (!trail || !trail.geometry) return notFoundOgCard();

  const tsport = await getTranslations({
    locale: params.locale,
    namespace: "planner.sports",
  });
  // Gravel wint van de ruwe sport (touring) op de kaart, net als op de pagina.
  const sportKey = trail.is_gravel ? "gravel" : (trail.sport as string);

  return routeOgCard({
    name: trail.name as string,
    sportLabel: tsport(sportKey as never),
    coords: (trail.geometry as GeoJSON.LineString).coordinates as [number, number][],
    distanceM: (trail.stats as { distanceM: number }).distanceM,
    ascendM: (trail.stats as { ascendM: number }).ascendM,
    timeS: (trail.stats as { timeS?: number }).timeS,
  });
}
