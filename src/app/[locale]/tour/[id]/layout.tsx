import { notFound } from "next/navigation";
import { getTour } from "./data";

// Bestaans-gate BOVEN de loading.tsx-Suspense. Waarom hier en niet (alleen) in
// page.tsx: loading.tsx maakt van de page een Suspense-boundary, dus Next
// streamt eerst een 200-shell (de skeleton) en pas daarna de page. Een
// notFound() ín de page valt dan ná die 200 → de HTTP-status blijft 200 en je
// krijgt een soft-404 (200 mét 404-UI). Google indexeert die als geldige
// pagina; een gedeelde link naar een verwijderde tour hoort hard te 404'en.
//
// Een layout rendert BOVEN de Suspense van zijn eigen segment. Awaiten we de
// bestaanscheck hier, dan is de shell nog niet verstuurd → notFound() geeft een
// echte 404. Bestaat de tour wél, dan valt-ie door en toont loading.tsx alsnog
// de skeleton terwijl page.tsx de trage delen (weer/gerelateerd/highlights)
// laadt. getTour is ge-cache()'d, dus dit kost geen extra query (layout + page
// + generateMetadata delen één round-trip).
export default async function TourLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { id: string; locale: string };
}) {
  const tour = await getTour(params.id);
  if (!tour) notFound();
  return <>{children}</>;
}
