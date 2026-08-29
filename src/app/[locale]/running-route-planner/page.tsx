import type { Metadata } from "next";
import ActivityPlannerLanding, {
  type ActivityCopy,
} from "@/components/seo/ActivityPlannerLanding";
import { getSiteSettings, pageTitle } from "@/lib/siteSettings";
import { SITE_URL } from "@/app/sitemap";

// SEO landing page — "running route planner" intent (nl: hardlooproute maken).
// Loop-vanaf-je-deur is de kern-intentie voor hardlopers (Rondje). trailsSport
// = "hike": /trails heeft geen "run"-filter, maar hardloop-/trailpaden zijn de
// voetpaden onder de wandel-filter. Claims binnen het product; geen
// afstand-doel-generator claimen (bestaat niet — "Rondje" maakt een lus).

export const revalidate = 86400;

const SLUG = "running-route-planner";

const COPY: Record<"nl" | "en", ActivityCopy> = {
  en: {
    metaTitle: "Running route planner",
    metaDescription:
      "Plan a running route anywhere in Europe — free, no account. Make a loop from your door, check the elevation and trail-versus-road surface, and export GPX to your running watch.",
    h1: "Running route planner",
    lede:
      "Tarnoo is a free running route planner for the whole of Europe. Make a loop from your front door or plan a point-to-point run, see the distance, elevation and how much is trail versus road, and send a GPX to your running watch. No account needed to plan or export.",
    ctaPlan: "Plan a running route",
    ctaTrails: "Browse footpaths and trails",
    featuresHeading: "For road runs and trail runs",
    features: [
      {
        h: "Loop from your door",
        p: "Start from a single point and use “Round trip” to build a loop that brings you back to where you started — the everyday runner's route.",
      },
      {
        h: "Trail versus road",
        p: "Every route shows a surface breakdown — paved versus unpaved — and marks the unpaved stretches on the map, so you can pick a road run or a trail run on purpose.",
      },
      {
        h: "Elevation and climbs",
        p: "See total ascent and descent, a full elevation profile, and each climb with its length and gradient — useful whether you want a flat tempo run or hill reps.",
      },
      {
        h: "GPX for your running watch",
        p: "Export your route as a GPX file or a turn-by-turn course and load it onto a Garmin, Coros, Suunto, Apple Watch or a phone app. Already have a track? Import a GPX and edit it.",
      },
      {
        h: "Running mode",
        p: "The running mode routes along footpaths, parks and quieter ways rather than main roads, so the route fits how you actually run.",
      },
      {
        h: "Free, no sign-up",
        p: "Planning a route and exporting the GPX needs no account. A free login only adds saving routes, building collections and following others.",
      },
    ],
    stepsHeading: "How to plan a running route",
    steps: [
      "Enter your start point — your home, say — and make it a loop with “Round trip”, or add a destination.",
      "Choose the running activity so the route uses footpaths and quieter ways.",
      "Drag the line or add waypoints to route it through the parks and paths you like.",
      "Check the distance, elevation and trail-versus-road surface.",
      "Export a GPX to your running watch.",
    ],
    trailsHeading: "Or start from a footpath route",
    trailsBody:
      "Want a trail run? Browse the waymarked footpath routes imported from OpenStreetMap and open one as a base — then adjust it or turn it into a loop.",
    faqHeading: "Frequently asked questions",
    faq: [
      {
        q: "Is Tarnoo's running route planner free?",
        a: "Yes. Planning a route and exporting the GPX are free and need no account. A free login only adds optional features like saving routes and building collections.",
      },
      {
        q: "Can I make a loop from my house?",
        a: "Yes. Enter your start point and use the “Round trip” option to generate a loop that brings you back to where you began.",
      },
      {
        q: "Can I get a GPX for my Garmin, Coros or Apple Watch?",
        a: "Yes. Export your route as a GPX file or a turn-by-turn course and load it onto a Garmin, Coros, Suunto, Apple Watch, another GPS device or a phone app. You can also import an existing GPX.",
      },
      {
        q: "Can I choose a trail run or a road run?",
        a: "Yes. Every route shows a surface breakdown — paved versus unpaved — and marks the unpaved stretches, so you can plan a road run or a trail run deliberately.",
      },
      {
        q: "Does it show elevation?",
        a: "Yes. Every route has a full elevation profile with total ascent and descent, and each climb is listed with its length and average gradient.",
      },
    ],
    relatedHeading: "Other route planners",
    related: [
      { label: "Hiking route planner", slug: "hiking-route-planner" },
      { label: "Cycling route planner", slug: "cycling-route-planner" },
      { label: "MTB route planner", slug: "mtb-route-planner" },
      { label: "Make a GPX file", slug: "gpx" },
    ],
    closingHeading: "Plan your run",
    closingBody:
      "Open the planner, pick running, and build your loop. No account, no cost.",
    breadcrumbHome: "Home",
  },
  nl: {
    metaTitle: "Hardlooproute maken",
    metaDescription:
      "Maak gratis een hardlooproute in heel Europa — geen account nodig. Maak een rondje vanaf je deur, bekijk de hoogte en trail-versus-weg-ondergrond, en exporteer een GPX naar je hardloophorloge.",
    h1: "Hardlooproute maken",
    lede:
      "Tarnoo is een gratis hardlooprouteplanner voor heel Europa. Maak een rondje vanaf je voordeur of plan een route van A naar B, zie de afstand, de hoogte en hoeveel trail versus weg is, en stuur een GPX naar je hardloophorloge. Plannen en exporteren kan zonder account.",
    ctaPlan: "Hardlooproute plannen",
    ctaTrails: "Bekijk voetpaden en trails",
    featuresHeading: "Voor wegrondjes en trailruns",
    features: [
      {
        h: "Rondje vanaf je deur",
        p: "Begin vanaf één punt en gebruik “Rondje” om een lus te maken die je terugbrengt bij je start — het dagelijkse hardlooprondje.",
      },
      {
        h: "Trail versus weg",
        p: "Elke route toont een ondergrond-verdeling — verhard versus onverhard — en markeert de onverharde stukken op de kaart, zodat je bewust een wegrondje of een trailrun kiest.",
      },
      {
        h: "Hoogte en klimmen",
        p: "Zie de totale stijging en daling, een volledig hoogteprofiel, en elke klim met lengte en stijgingspercentage — handig of je nu een vlakke tempoloop of heuveltraining wilt.",
      },
      {
        h: "GPX voor je hardloophorloge",
        p: "Exporteer je route als GPX of turn-by-turn-koers en zet 'm op een Garmin, Coros, Suunto, Apple Watch of telefoon-app. Heb je al een track? Importeer een GPX en pas 'm aan.",
      },
      {
        h: "Hardloopmodus",
        p: "De hardloopmodus routeert langs voetpaden, parken en rustigere wegen in plaats van hoofdwegen, zodat de route past bij hoe je echt loopt.",
      },
      {
        h: "Gratis, geen account",
        p: "Een route plannen en de GPX exporteren kan zonder account. Een gratis login voegt alleen routes opslaan, collecties maken en anderen volgen toe.",
      },
    ],
    stepsHeading: "Zo maak je een hardlooproute",
    steps: [
      "Voer je startpunt in — bijvoorbeeld je huis — en maak er met “Rondje” een lus van, of voeg een bestemming toe.",
      "Kies de activiteit hardlopen, zodat de route voetpaden en rustigere wegen gebruikt.",
      "Sleep de lijn of voeg waypoints toe om 'm langs de parken en paden te sturen die je fijn vindt.",
      "Bekijk de afstand, de hoogte en de trail-versus-weg-ondergrond.",
      "Exporteer een GPX naar je hardloophorloge.",
    ],
    trailsHeading: "Of begin vanaf een voetpad-route",
    trailsBody:
      "Zin in een trailrun? Bekijk de bewegwijzerde voetpad-routes uit OpenStreetMap en open er één als basis — pas 'm daarna aan of maak er een rondje van.",
    faqHeading: "Veelgestelde vragen",
    faq: [
      {
        q: "Is de hardlooprouteplanner van Tarnoo gratis?",
        a: "Ja. Een route plannen en de GPX exporteren is gratis en zonder account. Een gratis login voegt alleen optionele functies toe, zoals routes opslaan en collecties maken.",
      },
      {
        q: "Kan ik een rondje vanaf mijn huis maken?",
        a: "Ja. Voer je startpunt in en gebruik “Rondje” om een lus te genereren die je terugbrengt bij je vertrekpunt.",
      },
      {
        q: "Kan ik een GPX voor mijn Garmin, Coros of Apple Watch krijgen?",
        a: "Ja. Exporteer je route als GPX-bestand of turn-by-turn-koers en zet 'm op een Garmin, Coros, Suunto, Apple Watch, ander GPS-apparaat of telefoon-app. Een bestaande GPX importeren kan ook.",
      },
      {
        q: "Kan ik kiezen tussen een trailrun en een wegrondje?",
        a: "Ja. Elke route toont een ondergrond-verdeling — verhard versus onverhard — en markeert de onverharde stukken, zodat je bewust een wegrondje of trailrun plant.",
      },
      {
        q: "Toont het hoogte?",
        a: "Ja. Elke route heeft een volledig hoogteprofiel met totale stijging en daling, en elke klim staat er apart bij met lengte en gemiddeld stijgingspercentage.",
      },
    ],
    relatedHeading: "Andere routeplanners",
    related: [
      { label: "Wandelroute maken", slug: "hiking-route-planner" },
      { label: "Fietsroute plannen", slug: "cycling-route-planner" },
      { label: "MTB-route plannen", slug: "mtb-route-planner" },
      { label: "GPX maken", slug: "gpx" },
    ],
    closingHeading: "Plan je run",
    closingBody:
      "Open de planner, kies hardlopen en bouw je rondje. Geen account, geen kosten.",
    breadcrumbHome: "Home",
  },
};

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const c = COPY[params.locale === "nl" ? "nl" : "en"];
  return {
    title: pageTitle(await getSiteSettings(), c.metaTitle),
    description: c.metaDescription,
    alternates: { canonical: `/${params.locale}/${SLUG}` },
    openGraph: {
      title: c.metaTitle,
      description: c.metaDescription,
      url: `${SITE_URL}/${params.locale}/${SLUG}`,
      type: "website",
    },
  };
}

export default function RunningRoutePlannerPage({
  params,
}: {
  params: { locale: string };
}) {
  return (
    <ActivityPlannerLanding
      locale={params.locale}
      slug={SLUG}
      sport="run"
      trailsSport="hike"
      copy={COPY[params.locale === "nl" ? "nl" : "en"]}
    />
  );
}
