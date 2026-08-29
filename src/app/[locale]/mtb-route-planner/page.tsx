import type { Metadata } from "next";
import ActivityPlannerLanding, {
  type ActivityCopy,
} from "@/components/seo/ActivityPlannerLanding";
import { getSiteSettings, pageTitle } from "@/lib/siteSettings";
import { SITE_URL } from "@/app/sitemap";

// SEO landing page — "MTB / mountain bike route planner" intent.
// Eigen pagina naast fietsen: ander terrein (onverhard/off-road) en andere
// zoekintentie. Claims blijven binnen wat het product doet: mtb-routeprofiel,
// ondergrond, hoogte/klim+afdaling, GPX, rondjes. GÉÉN technische trail-grading
// (S0-S5) of singletrack-detectie — dat bestaat niet, dus claimen we het niet.

export const revalidate = 86400;

const SLUG = "mtb-route-planner";

const COPY: Record<"nl" | "en", ActivityCopy> = {
  en: {
    metaTitle: "MTB route planner",
    metaDescription:
      "Plan a mountain bike route anywhere in Europe — free, no account. Use the MTB routing mode, see how much is off-road, check the climbs and descents, and export GPX to your GPS or watch.",
    h1: "MTB route planner",
    lede:
      "Tarnoo is a free mountain bike route planner for the whole of Europe. Switch to the MTB mode and the route favours tracks and trails over tarmac. Draw your ride or make it a loop, see how much of it is unpaved, check the climbs and descents, and export a GPX for your GPS or watch. No account needed to plan or export.",
    ctaPlan: "Plan an MTB route",
    ctaTrails: "Browse MTB routes",
    featuresHeading: "Made for off-road",
    features: [
      {
        h: "MTB routing mode",
        p: "The MTB mode uses its own routing profile that prefers tracks, trails and unpaved ways over roads — so between the same two points you get an off-road ride, not a road one.",
      },
      {
        h: "How much is off-road",
        p: "Every route shows a surface breakdown — paved versus unpaved — and marks the unpaved stretches on the map, so you can see how much real dirt the route actually has before you ride it.",
      },
      {
        h: "Climbs and descents",
        p: "See total ascent and descent, a full elevation profile, and each climb listed with its length and average gradient — so you know where the work is and where the descents come.",
      },
      {
        h: "GPX for your GPS or watch",
        p: "Export your route as a GPX file or a turn-by-turn course and load it onto a Garmin, a GPS unit or a watch. Already have a track? Import a GPX and reshape it in the planner.",
      },
      {
        h: "Loops and big days",
        p: "Build a loop from a single start with “Round trip”, or split a long ride into day stages, each with its own distance and climbing.",
      },
      {
        h: "Free, no sign-up",
        p: "Planning a route and exporting the GPX needs no account. A free login only adds saving routes, building collections and following others.",
      },
    ],
    stepsHeading: "How to plan an MTB route",
    steps: [
      "Enter a start point — and a destination, or turn it into a loop with “Round trip”.",
      "Choose the MTB activity so the route favours tracks and trails.",
      "Drag the route line or add waypoints to send it over the trails you want.",
      "Check the surface breakdown, climbs and descents, and difficulty.",
      "Export a GPX for your device, or split a big ride into day stages.",
    ],
    trailsHeading: "Or start from an existing MTB route",
    trailsBody:
      "Prefer to start from a known route? Browse the MTB routes imported from OpenStreetMap and open one as a base — then adjust the line, add a climb, or turn it into a loop.",
    faqHeading: "Frequently asked questions",
    faq: [
      {
        q: "Is Tarnoo's MTB route planner free?",
        a: "Yes. Planning a route and exporting the GPX are free and need no account. A free login only adds optional features like saving routes and building collections.",
      },
      {
        q: "Does it route off-road?",
        a: "Yes. In MTB mode the routing profile prefers tracks, trails and unpaved ways over roads, and every route shows a surface breakdown so you can see how much is off-road.",
      },
      {
        q: "Which countries does it cover?",
        a: "All of Europe. Routing and route data come from OpenStreetMap, so you can plan a ride in the Alps, the UK, the Netherlands, Italy and everywhere in between.",
      },
      {
        q: "Can I get a GPX for my Garmin or watch?",
        a: "Yes. Export your route as a GPX file or a turn-by-turn course and load it onto a Garmin, another GPS device or a watch. You can also import an existing GPX to edit it.",
      },
      {
        q: "Does it show climbing and descents?",
        a: "Yes. Every route has a full elevation profile with total ascent and descent, and each significant climb is listed with its length and average gradient.",
      },
    ],
    relatedHeading: "Other route planners",
    related: [
      { label: "Cycling route planner", slug: "cycling-route-planner" },
      { label: "Hiking route planner", slug: "hiking-route-planner" },
      { label: "Running route planner", slug: "running-route-planner" },
    ],
    closingHeading: "Plan your ride",
    closingBody:
      "Open the planner, switch to MTB, and build your route. No account, no cost.",
    breadcrumbHome: "Home",
  },
  nl: {
    metaTitle: "MTB-route plannen",
    metaDescription:
      "Plan gratis een mountainbikeroute in heel Europa — geen account nodig. Gebruik de MTB-modus, zie hoeveel onverhard is, bekijk de klimmen en afdalingen, en exporteer een GPX naar je GPS of horloge.",
    h1: "MTB-route plannen",
    lede:
      "Tarnoo is een gratis mountainbike-routeplanner voor heel Europa. Schakel naar de MTB-modus en de route kiest liever tracks en trails dan asfalt. Teken je rit of maak er een rondje van, zie hoeveel ervan onverhard is, bekijk de klimmen en afdalingen, en exporteer een GPX voor je GPS of horloge. Plannen en exporteren kan zonder account.",
    ctaPlan: "MTB-route plannen",
    ctaTrails: "Bekijk MTB-routes",
    featuresHeading: "Gemaakt voor off-road",
    features: [
      {
        h: "MTB-routemodus",
        p: "De MTB-modus gebruikt een eigen routeprofiel dat tracks, trails en onverharde wegen verkiest boven wegen — zo krijg je tussen dezelfde twee punten een off-road-rit, geen wegrit.",
      },
      {
        h: "Hoeveel onverhard",
        p: "Elke route toont een ondergrond-verdeling — verhard versus onverhard — en markeert de onverharde stukken op de kaart, zodat je vóór de rit ziet hoeveel echt zand en pad erin zit.",
      },
      {
        h: "Klimmen en afdalingen",
        p: "Zie de totale stijging en daling, een volledig hoogteprofiel, en elke klim apart met lengte en gemiddeld stijgingspercentage — zo weet je waar het werk zit en waar de afdalingen komen.",
      },
      {
        h: "GPX voor je GPS of horloge",
        p: "Exporteer je route als GPX of turn-by-turn-koers en zet 'm op een Garmin, GPS-unit of horloge. Heb je al een track? Importeer een GPX en pas 'm aan in de planner.",
      },
      {
        h: "Rondjes en lange dagen",
        p: "Maak een rondje vanaf één startpunt met “Rondje”, of splits een lange rit in dagetappes, elk met een eigen afstand en klimwerk.",
      },
      {
        h: "Gratis, geen account",
        p: "Een route plannen en de GPX exporteren kan zonder account. Een gratis login voegt alleen routes opslaan, collecties maken en anderen volgen toe.",
      },
    ],
    stepsHeading: "Zo plan je een MTB-route",
    steps: [
      "Voer een startpunt in — en een bestemming, of maak er met “Rondje” een lus van.",
      "Kies de activiteit MTB, zodat de route tracks en trails verkiest.",
      "Sleep de routelijn of voeg waypoints toe om 'm over de trails te sturen die je wilt.",
      "Bekijk de ondergrond-verdeling, de klimmen en afdalingen, en de zwaarte.",
      "Exporteer een GPX voor je apparaat, of splits een lange rit in dagetappes.",
    ],
    trailsHeading: "Of begin vanaf een bestaande MTB-route",
    trailsBody:
      "Liever vanaf een bekende route? Bekijk de MTB-routes uit OpenStreetMap en open er één als basis — pas daarna de lijn aan, voeg een klim toe, of maak er een rondje van.",
    faqHeading: "Veelgestelde vragen",
    faq: [
      {
        q: "Is de MTB-routeplanner van Tarnoo gratis?",
        a: "Ja. Een route plannen en de GPX exporteren is gratis en zonder account. Een gratis login voegt alleen optionele functies toe, zoals routes opslaan en collecties maken.",
      },
      {
        q: "Routeert het off-road?",
        a: "Ja. In de MTB-modus verkiest het routeprofiel tracks, trails en onverharde wegen boven wegen, en elke route toont een ondergrond-verdeling zodat je ziet hoeveel off-road is.",
      },
      {
        q: "Welke landen worden gedekt?",
        a: "Heel Europa. De routering en routedata komen uit OpenStreetMap, dus je plant een rit in de Alpen, het VK, Nederland, Italië en alles daartussenin.",
      },
      {
        q: "Kan ik een GPX voor mijn Garmin of horloge krijgen?",
        a: "Ja. Exporteer je route als GPX-bestand of turn-by-turn-koers en zet 'm op een Garmin, ander GPS-apparaat of horloge. Een bestaande GPX importeren om aan te passen kan ook.",
      },
      {
        q: "Toont het klimwerk en afdalingen?",
        a: "Ja. Elke route heeft een volledig hoogteprofiel met totale stijging en daling, en elke serieuze klim staat er apart bij met lengte en gemiddeld stijgingspercentage.",
      },
    ],
    relatedHeading: "Andere routeplanners",
    related: [
      { label: "Fietsroute plannen", slug: "cycling-route-planner" },
      { label: "Wandelroute maken", slug: "hiking-route-planner" },
      { label: "Hardlooproute maken", slug: "running-route-planner" },
    ],
    closingHeading: "Plan je rit",
    closingBody:
      "Open de planner, schakel naar MTB en bouw je route. Geen account, geen kosten.",
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

export default function MtbRoutePlannerPage({
  params,
}: {
  params: { locale: string };
}) {
  return (
    <ActivityPlannerLanding
      locale={params.locale}
      slug={SLUG}
      sport="mtb"
      trailsSport="mtb"
      copy={COPY[params.locale === "nl" ? "nl" : "en"]}
    />
  );
}
