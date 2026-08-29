import type { Metadata } from "next";
import ActivityPlannerLanding, {
  type ActivityCopy,
} from "@/components/seo/ActivityPlannerLanding";
import { getSiteSettings, pageTitle } from "@/lib/siteSettings";
import { SITE_URL } from "@/app/sitemap";

// SEO landing page — "cycling route planner" intent (nl: fietsroute plannen).
// Dekt de fiets-modi die écht bestaan: toer (touring), gravel, racefiets (road)
// en e-bike. MTB heeft een eigen pagina (ander terrein/intentie). Geen
// kannibalisatie met de generieke planner-homepage. Alle claims 1-op-1 uit het
// product (zie seo/SEO_BACKLOG.md).

export const revalidate = 86400;

const SLUG = "cycling-route-planner";

const COPY: Record<"nl" | "en", ActivityCopy> = {
  en: {
    metaTitle: "Cycling route planner",
    metaDescription:
      "Plan a cycling route anywhere in Europe — free, no account. Choose touring, gravel, road or e-bike, see the elevation, climbs and surface, and export GPX to your Garmin, Wahoo or phone.",
    h1: "Cycling route planner",
    lede:
      "Tarnoo is a free cycling route planner for the whole of Europe. Pick the kind of riding you're doing — touring, gravel, road or e-bike — draw your route or make it a loop, and see the distance, elevation, climbs and road-versus-gravel surface before you clip in. Export a GPX for your bike computer in seconds. No account needed to plan or export.",
    ctaPlan: "Plan a cycling route",
    ctaTrails: "Browse cycling routes",
    featuresHeading: "Built for how you ride",
    features: [
      {
        h: "Touring, gravel, road and e-bike",
        p: "Each riding style uses its own routing profile, so a gravel route and a road route between the same two points can differ. Pick your bike and the route follows the roads and paths that suit it.",
      },
      {
        h: "Road vs gravel surface",
        p: "Tarnoo reads the OpenStreetMap surface tags along your route and shows how much is paved versus unpaved, and marks the unpaved stretches on the map — so you know whether it's a road ride or a gravel one before you commit.",
      },
      {
        h: "Elevation and every climb",
        p: "See total ascent and descent, a full elevation profile, and each climb listed separately with its length and average gradient — the difference between a flat spin and a day in the hills.",
      },
      {
        h: "GPX for your bike computer",
        p: "Export your route as a GPX file or a turn-by-turn course and load it onto a Garmin, a Wahoo, or a phone app. Already have a track? Import a GPX and reshape it in the planner.",
      },
      {
        h: "Multi-day and bikepacking",
        p: "Split a long tour into day stages, each with its own distance and climbing — turning a bikepacking trip or a week-long tour into a clear day-by-day plan.",
      },
      {
        h: "Free, no sign-up",
        p: "Planning a route and exporting the GPX needs no account. A free login only adds saving routes, building collections and following others.",
      },
    ],
    stepsHeading: "How to plan a cycling route",
    steps: [
      "Enter a start point — and a destination, or turn it into a loop with “Round trip”.",
      "Choose your riding style: touring, gravel, road or e-bike.",
      "Drag the route line or add waypoints to send it along the roads and paths you want.",
      "Check the elevation, climbs, and paved-versus-gravel surface breakdown.",
      "Export a GPX for your bike computer, or split a long tour into day stages.",
    ],
    trailsHeading: "Or start from an existing route",
    trailsBody:
      "Prefer to start from a known route? Browse the cycling routes imported from OpenStreetMap and open one as a base — then adjust the line, add a climb, or turn it into a loop.",
    faqHeading: "Frequently asked questions",
    faq: [
      {
        q: "Is Tarnoo's cycling route planner free?",
        a: "Yes. Planning a route and exporting the GPX are free and need no account. A free login only adds optional features like saving routes and building collections.",
      },
      {
        q: "Can I plan gravel, road and e-bike routes?",
        a: "Yes. You can choose touring, gravel, road (racefiets) or e-bike, and each uses a routing profile suited to that style of riding. Mountain biking has its own dedicated planner.",
      },
      {
        q: "Which countries does it cover?",
        a: "All of Europe. Routing and route data come from OpenStreetMap, so you can plan a ride in the Alps, the UK, the Netherlands, Italy and everywhere in between.",
      },
      {
        q: "Can I get a GPX for my Garmin or Wahoo?",
        a: "Yes. Export your route as a GPX file or a turn-by-turn course and load it onto a Garmin, a Wahoo, another GPS device or a phone app. You can also import an existing GPX to edit it.",
      },
      {
        q: "How do I know if a route is paved or gravel?",
        a: "Every route shows a surface breakdown — how much is paved versus unpaved — and the unpaved stretches are marked on the map, so you can match the route to your bike and tyres.",
      },
      {
        q: "Can I plan a multi-day bike tour?",
        a: "Yes. Any route can be split into day stages, each with its own distance and climbing, which is handy for bikepacking and multi-day tours.",
      },
    ],
    relatedHeading: "Other route planners",
    related: [{ label: "Hiking route planner", slug: "hiking-route-planner" }],
    closingHeading: "Plan your ride",
    closingBody:
      "Open the planner, pick your riding style, and build your route. No account, no cost.",
    breadcrumbHome: "Home",
  },
  nl: {
    metaTitle: "Fietsroute plannen",
    metaDescription:
      "Plan gratis een fietsroute in heel Europa — geen account nodig. Kies toer, gravel, racefiets of e-bike, zie de hoogte, klimmen en ondergrond, en exporteer een GPX naar je Garmin, Wahoo of telefoon.",
    h1: "Fietsroute plannen",
    lede:
      "Tarnoo is een gratis fietsrouteplanner voor heel Europa. Kies je manier van fietsen — toer, gravel, racefiets of e-bike — teken je route of maak er een rondje van, en zie de afstand, de hoogte, de klimmen en de verhard-versus-gravel-ondergrond voordat je vertrekt. Exporteer in seconden een GPX voor je fietscomputer. Plannen en exporteren kan zonder account.",
    ctaPlan: "Fietsroute plannen",
    ctaTrails: "Bekijk fietsroutes",
    featuresHeading: "Gemaakt voor hoe jij fietst",
    features: [
      {
        h: "Toer, gravel, racefiets en e-bike",
        p: "Elke fietsstijl gebruikt zijn eigen routeprofiel, dus een gravel- en een racefietsroute tussen dezelfde twee punten kunnen verschillen. Kies je fiets en de route volgt de wegen en paden die daarbij passen.",
      },
      {
        h: "Verhard versus gravel",
        p: "Tarnoo leest de OpenStreetMap-ondergrondtags langs je route en laat zien hoeveel verhard is versus onverhard, en markeert de onverharde stukken op de kaart — zo weet je vooraf of het een wegrit of een gravelrit wordt.",
      },
      {
        h: "Hoogte en elke klim",
        p: "Zie de totale stijging en daling, een volledig hoogteprofiel, en elke klim apart met lengte en gemiddeld stijgingspercentage — het verschil tussen een vlakke rit en een dag in de heuvels.",
      },
      {
        h: "GPX voor je fietscomputer",
        p: "Exporteer je route als GPX of turn-by-turn-koers en zet 'm op een Garmin, een Wahoo of een telefoon-app. Heb je al een track? Importeer een GPX en pas 'm aan in de planner.",
      },
      {
        h: "Meerdaags en bikepacking",
        p: "Splits een lange tocht in dagetappes, elk met een eigen afstand en klimwerk — zo wordt een bikepacking-trip of weektour een helder plan per dag.",
      },
      {
        h: "Gratis, geen account",
        p: "Een route plannen en de GPX exporteren kan zonder account. Een gratis login voegt alleen routes opslaan, collecties maken en anderen volgen toe.",
      },
    ],
    stepsHeading: "Zo plan je een fietsroute",
    steps: [
      "Voer een startpunt in — en een bestemming, of maak er met “Rondje” een lus van.",
      "Kies je fietsstijl: toer, gravel, racefiets of e-bike.",
      "Sleep de routelijn of voeg waypoints toe om 'm langs de wegen en paden te sturen die je wilt.",
      "Bekijk de hoogte, de klimmen en de verhard-versus-gravel-ondergrond.",
      "Exporteer een GPX voor je fietscomputer, of splits een lange tocht in dagetappes.",
    ],
    trailsHeading: "Of begin vanaf een bestaande route",
    trailsBody:
      "Liever vanaf een bekende route? Bekijk de fietsroutes uit OpenStreetMap en open er één als basis — pas daarna de lijn aan, voeg een klim toe, of maak er een rondje van.",
    faqHeading: "Veelgestelde vragen",
    faq: [
      {
        q: "Is de fietsrouteplanner van Tarnoo gratis?",
        a: "Ja. Een route plannen en de GPX exporteren is gratis en zonder account. Een gratis login voegt alleen optionele functies toe, zoals routes opslaan en collecties maken.",
      },
      {
        q: "Kan ik gravel-, racefiets- en e-bike-routes plannen?",
        a: "Ja. Je kiest toer, gravel, racefiets of e-bike, en elke stijl gebruikt een routeprofiel dat daarbij past. Mountainbiken heeft een eigen planner.",
      },
      {
        q: "Welke landen worden gedekt?",
        a: "Heel Europa. De routering en routedata komen uit OpenStreetMap, dus je plant een rit in de Alpen, het VK, Nederland, Italië en alles daartussenin.",
      },
      {
        q: "Kan ik een GPX voor mijn Garmin of Wahoo krijgen?",
        a: "Ja. Exporteer je route als GPX-bestand of turn-by-turn-koers en zet 'm op een Garmin, Wahoo, ander GPS-apparaat of telefoon-app. Een bestaande GPX importeren om aan te passen kan ook.",
      },
      {
        q: "Hoe weet ik of een route verhard of gravel is?",
        a: "Elke route toont een ondergrond-verdeling — hoeveel verhard versus onverhard — en de onverharde stukken staan op de kaart gemarkeerd, zodat je de route op je fiets en banden afstemt.",
      },
      {
        q: "Kan ik een meerdaagse fietstocht plannen?",
        a: "Ja. Elke route kan worden gesplitst in dagetappes, elk met een eigen afstand en klimwerk — handig voor bikepacking en meerdaagse tochten.",
      },
    ],
    relatedHeading: "Andere routeplanners",
    related: [{ label: "Wandelroute maken", slug: "hiking-route-planner" }],
    closingHeading: "Plan je rit",
    closingBody:
      "Open de planner, kies je fietsstijl en bouw je route. Geen account, geen kosten.",
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

export default function CyclingRoutePlannerPage({
  params,
}: {
  params: { locale: string };
}) {
  return (
    <ActivityPlannerLanding
      locale={params.locale}
      slug={SLUG}
      sport="touring"
      trailsSport="touring"
      copy={COPY[params.locale === "nl" ? "nl" : "en"]}
    />
  );
}
