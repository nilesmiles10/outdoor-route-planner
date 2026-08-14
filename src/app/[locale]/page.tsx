import type { Metadata } from "next";
import PlannerApp from "@/components/PlannerApp";

// Self-canonical op de schone locale-URL. De planner-homepage draagt allerlei
// query-varianten (?utm/?fbclid van gedeelde links, ?w=/?at= route-share-state)
// — die horen niet als losse pagina's geïndexeerd te worden. Canonical → /nl
// resp. /en consolideert ze naar één URL. Alleen `alternates` gezet, dus de
// titel/omschrijving/OG-afbeelding van de layout blijven ongemoeid.
export function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Metadata {
  return { alternates: { canonical: `/${params.locale}` } };
}

export default function Home() {
  return <PlannerApp />;
}
