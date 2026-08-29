import type { Metadata } from "next";
import ActivityPlannerLanding, {
  type ActivityCopy,
} from "@/components/seo/ActivityPlannerLanding";
import { getSiteSettings, pageTitle } from "@/lib/siteSettings";
import { SITE_URL } from "@/app/sitemap";

// SEO landing page — "hiking route planner" intent (nl: wandelroute maken).
// Bewust NIET de generieke "routeplanner"-intentie: die dekt de homepage al
// (kannibalisatie). Wandel-specifiek: officiële wandelroutes, hoogte/klim,
// ondergrond, meerdaags, GPX. Alle claims staan 1-op-1 in het product
// (zie seo/SEO_BACKLOG.md → product facts); niets verzonnen.

export const revalidate = 86400;

const SLUG = "hiking-route-planner";

const COPY: Record<"nl" | "en", ActivityCopy> = {
  en: {
    metaTitle: "Hiking route planner",
    metaDescription:
      "Plan a hiking route anywhere in Europe — free, no account. See the elevation profile, climbs and path surface before you go, start from 30,000+ waymarked trails, and export GPX to your watch or phone.",
    h1: "Hiking route planner",
    lede:
      "Tarnoo is a free hiking route planner for the whole of Europe. Draw a walk between two points or make it a loop, and see the distance, elevation profile, climbs, path surface and difficulty before you set off — then export a GPX for your watch or phone. No account needed to plan or export.",
    ctaPlan: "Plan a hiking route",
    ctaTrails: "Browse waymarked trails",
    featuresHeading: "What you can see before you walk",
    features: [
      {
        h: "Elevation profile and climbs",
        p: "Every route shows total ascent and descent, a full elevation profile, and each significant climb broken out with its length and average gradient — so you know how hard the day really is, not just how far.",
      },
      {
        h: "Path surface",
        p: "Tarnoo reads the OpenStreetMap tags along your route and shows how much is paved versus unpaved path or trail, and highlights the unpaved stretches on the map — useful when you want real trail underfoot, or want to avoid tarmac.",
      },
      {
        h: "30,000+ waymarked trails",
        p: "Don't want to draw from scratch? Start from an official, waymarked hiking route. Tarnoo has imported 30,000+ trails across Europe from OpenStreetMap, filterable by country, region and distance.",
      },
      {
        h: "Multi-day and hut-to-hut",
        p: "Planning a long-distance walk? Split any route into day stages with per-day distance and climbing, so a hut-to-hut or multi-day trek becomes a clear plan instead of one giant line.",
      },
      {
        h: "GPX for your watch or GPS",
        p: "Export your route as a GPX file, or a turn-by-turn course, and load it onto a Garmin, a watch or a phone app. Already have a track? Import an existing GPX and edit it in the planner.",
      },
      {
        h: "Free, no sign-up",
        p: "Planning a route and exporting the GPX needs no account. A free login only adds saving routes, building collections and following others — the planning itself is open.",
      },
    ],
    stepsHeading: "How to plan a hiking route",
    steps: [
      "Enter a start point — and a destination, or turn it into a loop from your start with “Round trip”.",
      "Choose the walking activity so the route follows footpaths and trails rather than roads.",
      "Drag the route line or drop waypoints to send it over the paths and viewpoints you want.",
      "Check the elevation profile, climbs, surface breakdown and difficulty rating.",
      "Export a GPX for your device, or split a long walk into day stages.",
    ],
    trailsHeading: "Or start from an official trail",
    trailsBody:
      "If you'd rather follow a marked route, browse the waymarked hiking trails and open one as a starting point — then tweak the line, add a detour to a viewpoint, or turn it into a loop.",
    faqHeading: "Frequently asked questions",
    faq: [
      {
        q: "Is Tarnoo's hiking route planner free?",
        a: "Yes. Planning a route and exporting the GPX are free and need no account. A free login only adds optional features like saving routes and building collections.",
      },
      {
        q: "Which countries does it cover?",
        a: "All of Europe. Routing and the trail data come from OpenStreetMap, so you can plan a walk in the Alps, the UK, the Netherlands, Italy and everywhere in between.",
      },
      {
        q: "Can I get a GPX file for my Garmin or watch?",
        a: "Yes. You can export your route as a GPX file or a turn-by-turn course and load it onto a Garmin, another GPS device, a sports watch or a phone app. You can also import an existing GPX to edit it.",
      },
      {
        q: "Does it show elevation and climbing?",
        a: "Yes. Every route has a full elevation profile with total ascent and descent, and each significant climb is listed with its length and average gradient.",
      },
      {
        q: "Can I plan a circular (round-trip) hike?",
        a: "Yes. From a single start point, the “Round trip” option generates a loop that brings you back to where you began.",
      },
      {
        q: "Can I plan a multi-day walk?",
        a: "Yes. Any route can be split into day stages, each with its own distance and climbing — handy for hut-to-hut and long-distance treks.",
      },
    ],
    relatedHeading: "Other route planners",
    related: [
      { label: "Cycling route planner", slug: "cycling-route-planner" },
      { label: "MTB route planner", slug: "mtb-route-planner" },
      { label: "Running route planner", slug: "running-route-planner" },
      { label: "Make a GPX file", slug: "gpx" },
      { label: "Multi-day route planner", slug: "multi-day-route-planner" },
    ],
    closingHeading: "Plan your walk",
    closingBody:
      "Open the planner, pick the walking activity, and build your route. No account, no cost.",
    breadcrumbHome: "Home",
  },
  nl: {
    metaTitle: "Wandelroute maken",
    metaDescription:
      "Maak gratis een wandelroute in heel Europa — geen account nodig. Zie vooraf het hoogteprofiel, de klimmen en de ondergrond, begin vanaf 30.000+ bewegwijzerde routes en exporteer een GPX naar je horloge of telefoon.",
    h1: "Wandelroute maken",
    lede:
      "Tarnoo is een gratis wandelrouteplanner voor heel Europa. Teken een wandeling tussen twee punten of maak er een rondje van, en zie vóór vertrek de afstand, het hoogteprofiel, de klimmen, de ondergrond en de zwaarte — en exporteer daarna een GPX voor je horloge of telefoon. Plannen en exporteren kan zonder account.",
    ctaPlan: "Wandelroute plannen",
    ctaTrails: "Bekijk bewegwijzerde routes",
    featuresHeading: "Wat je ziet vóór je gaat lopen",
    features: [
      {
        h: "Hoogteprofiel en klimmen",
        p: "Elke route toont de totale stijging en daling, een volledig hoogteprofiel, en elke serieuze klim apart met lengte en gemiddeld stijgingspercentage — zo weet je hoe zwaar de dag echt is, niet alleen hoe ver.",
      },
      {
        h: "Ondergrond",
        p: "Tarnoo leest de OpenStreetMap-tags langs je route en laat zien hoeveel verhard is versus onverhard pad of trail, en markeert de onverharde stukken op de kaart — handig als je juist echt pad onder je voeten wilt, of asfalt wilt vermijden.",
      },
      {
        h: "30.000+ bewegwijzerde routes",
        p: "Niet vanaf nul tekenen? Begin vanaf een officiële, bewegwijzerde wandelroute. Tarnoo heeft 30.000+ routes uit heel Europa geïmporteerd uit OpenStreetMap, te filteren op land, regio en afstand.",
      },
      {
        h: "Meerdaags en van hut naar hut",
        p: "Een langeafstandswandeling? Splits elke route in dagetappes met per dag de afstand en het klimwerk, zodat een hut-tot-hut- of meerdaagse tocht een helder plan wordt in plaats van één lange lijn.",
      },
      {
        h: "GPX voor je horloge of GPS",
        p: "Exporteer je route als GPX of als turn-by-turn-koers en zet 'm op een Garmin, horloge of telefoon-app. Heb je al een track? Importeer een bestaande GPX en pas 'm aan in de planner.",
      },
      {
        h: "Gratis, geen account",
        p: "Een route plannen en de GPX exporteren kan zonder account. Een gratis login voegt alleen het opslaan van routes, collecties maken en anderen volgen toe — het plannen zelf is open.",
      },
    ],
    stepsHeading: "Zo maak je een wandelroute",
    steps: [
      "Voer een startpunt in — en een bestemming, of maak er met “Rondje” een lus van vanaf je start.",
      "Kies de activiteit wandelen, zodat de route paden en trails volgt in plaats van wegen.",
      "Sleep de routelijn of plaats waypoints om 'm langs de paden en uitzichten te sturen die je wilt.",
      "Bekijk het hoogteprofiel, de klimmen, de ondergrond en de zwaarte.",
      "Exporteer een GPX voor je apparaat, of splits een lange wandeling in dagetappes.",
    ],
    trailsHeading: "Of begin vanaf een officiële route",
    trailsBody:
      "Wil je liever een bewegwijzerde route volgen? Bekijk de bewegwijzerde wandelroutes en open er één als startpunt — pas daarna de lijn aan, voeg een ommetje langs een uitzicht toe, of maak er een rondje van.",
    faqHeading: "Veelgestelde vragen",
    faq: [
      {
        q: "Is de wandelrouteplanner van Tarnoo gratis?",
        a: "Ja. Een route plannen en de GPX exporteren is gratis en zonder account. Een gratis login voegt alleen optionele functies toe, zoals routes opslaan en collecties maken.",
      },
      {
        q: "Welke landen worden gedekt?",
        a: "Heel Europa. De routering en de routedata komen uit OpenStreetMap, dus je plant een wandeling in de Alpen, het VK, Nederland, Italië en alles daartussenin.",
      },
      {
        q: "Kan ik een GPX voor mijn Garmin of horloge krijgen?",
        a: "Ja. Je exporteert je route als GPX-bestand of als turn-by-turn-koers en zet 'm op een Garmin, ander GPS-apparaat, sporthorloge of telefoon-app. Een bestaande GPX importeren om aan te passen kan ook.",
      },
      {
        q: "Toont het hoogte en klimwerk?",
        a: "Ja. Elke route heeft een volledig hoogteprofiel met totale stijging en daling, en elke serieuze klim staat er apart bij met lengte en gemiddeld stijgingspercentage.",
      },
      {
        q: "Kan ik een rondwandeling (rondje) plannen?",
        a: "Ja. Vanaf één startpunt genereert de optie “Rondje” een lus die je terugbrengt bij je vertrekpunt.",
      },
      {
        q: "Kan ik een meerdaagse wandeling plannen?",
        a: "Ja. Elke route kan worden gesplitst in dagetappes, elk met een eigen afstand en klimwerk — handig voor hut-tot-hut- en langeafstandstochten.",
      },
    ],
    relatedHeading: "Andere routeplanners",
    related: [
      { label: "Fietsroute plannen", slug: "cycling-route-planner" },
      { label: "MTB-route plannen", slug: "mtb-route-planner" },
      { label: "Hardlooproute maken", slug: "running-route-planner" },
      { label: "GPX maken", slug: "gpx" },
      { label: "Meerdaagse route plannen", slug: "multi-day-route-planner" },
    ],
    closingHeading: "Plan je wandeling",
    closingBody:
      "Open de planner, kies de activiteit wandelen en bouw je route. Geen account, geen kosten.",
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

export default function HikingRoutePlannerPage({
  params,
}: {
  params: { locale: string };
}) {
  return (
    <ActivityPlannerLanding
      locale={params.locale}
      slug={SLUG}
      sport="hike"
      trailsSport="hike"
      copy={COPY[params.locale === "nl" ? "nl" : "en"]}
    />
  );
}
