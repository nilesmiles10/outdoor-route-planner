import { getTranslations } from "next-intl/server";
import { supabaseServer } from "@/lib/supabase/server";
import { notFoundOgCard, OG_SIZE, routeOgCard } from "@/lib/og/routeCard";

export const runtime = "nodejs";
export const size = OG_SIZE;
export const contentType = "image/png";

// OG card: route polyline drawn as pure SVG (no external tiles → works inside
// the OG renderer), plus headline stats. Shared with the trail OG image.
export default async function OgImage({
  params,
}: {
  params: { id: string; locale: string };
}) {
  const sb = supabaseServer();
  const { data: tour } = await sb
    .from("tours")
    .select("name,sport,geometry,stats")
    .eq("id", params.id)
    .maybeSingle();

  if (!tour || !tour.geometry) return notFoundOgCard();

  // Nette, gelokaliseerde sport-label i.p.v. de ruwe sleutel; expliciete locale
  // zodat het niet op request-context leunt.
  const tsport = await getTranslations({
    locale: params.locale,
    namespace: "planner.sports",
  });

  return routeOgCard({
    name: tour.name as string,
    sportLabel: tsport(tour.sport as never),
    coords: (tour.geometry as GeoJSON.LineString).coordinates as [number, number][],
    distanceM: (tour.stats as { distanceM: number }).distanceM,
    ascendM: (tour.stats as { ascendM: number }).ascendM,
    timeS: (tour.stats as { timeS?: number }).timeS,
  });
}
