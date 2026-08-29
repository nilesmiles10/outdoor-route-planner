import type { Metadata } from "next";
import ActivityPlannerLanding, {
  type ActivityCopy,
} from "@/components/seo/ActivityPlannerLanding";
import { getSiteSettings, pageTitle } from "@/lib/siteSettings";
import { SITE_URL } from "@/app/sitemap";

// SEO landing page — GPX intent ("make/create a GPX", "gpx route planner",
// "gpx maken"). Feature/tool page, activiteit-agnostisch: geen trails-sectie,
// planner-CTA zonder voorgeselecteerde sport. Claims binnen het product: GPX
// import + export, turn-by-turn-koers, alle activiteiten, gratis/geen account.
// GÉÉN specifieke app-namen claimen die het bestand "gegarandeerd" openen —
// generiek "GPS-apparaten, sporthorloges en telefoon-apps".

export const revalidate = 86400;

const SLUG = "gpx";

const COPY: Record<"nl" | "en", ActivityCopy> = {
  en: {
    metaTitle: "GPX route planner — create & export GPX files",
    metaDescription:
      "Make a GPX file from any route — free, no account. Draw a route in the planner, export a GPX or turn-by-turn course, and load it onto your Garmin, watch or phone. Import an existing GPX to edit it.",
    h1: "GPX route planner",
    lede:
      "Tarnoo lets you create a GPX file from any route — free and without an account. Draw a route anywhere in Europe, check the elevation and surface, then export a GPX or a turn-by-turn course and load it onto a GPS device, a sports watch or a phone app. Already have a GPX? Import it to view and edit it.",
    ctaPlan: "Open the route planner",
    featuresHeading: "Everything you need for GPX",
    features: [
      {
        h: "Export a GPX in one click",
        p: "Draw a route and export it as a standard GPX file. That's the format almost every GPS device, sports watch and mapping app can read.",
      },
      {
        h: "Turn-by-turn course",
        p: "As well as a plain GPX track, you can export a turn-by-turn course with the directions along the way, for devices that show navigation prompts.",
      },
      {
        h: "Import an existing GPX",
        p: "Have a GPX already — from a friend, a race, or another app? Import it into the planner to see its elevation profile and surface, and reshape it if you want.",
      },
      {
        h: "Any activity",
        p: "Plan and export for hiking, running, cycling (touring, gravel, road, e-bike) or mountain biking. The routing follows ways that suit the activity you pick.",
      },
      {
        h: "See it before you export",
        p: "Before you save the file, you see the distance, the full elevation profile with climbs, and the paved-versus-unpaved surface breakdown — so you export a route you actually want.",
      },
      {
        h: "Free, no sign-up",
        p: "Creating and exporting a GPX needs no account. A free login only adds saving routes, building collections and following others.",
      },
    ],
    stepsHeading: "How to make a GPX file",
    steps: [
      "Open the route planner and set a start point — add a destination, or make a loop with “Round trip”.",
      "Pick your activity so the route follows suitable ways.",
      "Drag the line or add waypoints until the route is what you want.",
      "Open Export and choose GPX (or a turn-by-turn course).",
      "Load the file onto your GPS device, watch or phone app.",
    ],
    faqHeading: "Frequently asked questions",
    faq: [
      {
        q: "Is it free to make a GPX with Tarnoo?",
        a: "Yes. Creating a route and exporting the GPX are free and need no account. A free login only adds optional features like saving routes and building collections.",
      },
      {
        q: "What is a GPX file?",
        a: "GPX is a standard file format that describes a route as a series of GPS points. Most GPS devices, sports watches and mapping apps can open a GPX file to follow the route.",
      },
      {
        q: "Can I import a GPX I already have?",
        a: "Yes. Import an existing GPX into the planner to view its elevation profile and surface, and edit the line if you want to change it.",
      },
      {
        q: "Will the GPX work on my Garmin or watch?",
        a: "Yes. You can export a plain GPX track or a turn-by-turn course and load it onto a Garmin, another GPS device, a sports watch or a phone app.",
      },
      {
        q: "Can I make a GPX for any activity?",
        a: "Yes. You can plan and export for hiking, running, cycling (touring, gravel, road and e-bike) and mountain biking.",
      },
    ],
    relatedHeading: "Plan by activity",
    related: [
      { label: "Hiking route planner", slug: "hiking-route-planner" },
      { label: "Cycling route planner", slug: "cycling-route-planner" },
      { label: "MTB route planner", slug: "mtb-route-planner" },
      { label: "Running route planner", slug: "running-route-planner" },
    ],
    closingHeading: "Make your GPX",
    closingBody:
      "Open the planner, draw your route, and export the GPX. No account, no cost.",
    breadcrumbHome: "Home",
  },
  nl: {
    metaTitle: "GPX maken — GPX-route maken en exporteren",
    metaDescription:
      "Maak een GPX-bestand van elke route — gratis, geen account. Teken een route in de planner, exporteer een GPX of turn-by-turn-koers, en zet 'm op je Garmin, horloge of telefoon. Importeer een bestaande GPX om aan te passen.",
    h1: "GPX maken",
    lede:
      "Met Tarnoo maak je een GPX-bestand van elke route — gratis en zonder account. Teken een route ergens in Europa, bekijk de hoogte en ondergrond, en exporteer daarna een GPX of turn-by-turn-koers om op een GPS-apparaat, sporthorloge of telefoon-app te zetten. Heb je al een GPX? Importeer 'm om te bekijken en aan te passen.",
    ctaPlan: "Open de routeplanner",
    featuresHeading: "Alles voor GPX",
    features: [
      {
        h: "Exporteer een GPX in één klik",
        p: "Teken een route en exporteer 'm als standaard GPX-bestand. Dat is het formaat dat vrijwel elk GPS-apparaat, sporthorloge en kaart-app kan lezen.",
      },
      {
        h: "Turn-by-turn-koers",
        p: "Naast een gewone GPX-track kun je een turn-by-turn-koers exporteren met de aanwijzingen onderweg, voor apparaten die navigatie-prompts tonen.",
      },
      {
        h: "Importeer een bestaande GPX",
        p: "Heb je al een GPX — van iemand anders, een wedstrijd of een andere app? Importeer 'm in de planner om het hoogteprofiel en de ondergrond te zien, en pas de lijn aan als je wilt.",
      },
      {
        h: "Elke activiteit",
        p: "Plan en exporteer voor wandelen, hardlopen, fietsen (toer, gravel, racefiets, e-bike) of mountainbiken. De routering volgt wegen die bij de gekozen activiteit passen.",
      },
      {
        h: "Zie 'm vóór je exporteert",
        p: "Voordat je het bestand opslaat, zie je de afstand, het volledige hoogteprofiel met klimmen, en de verhard-versus-onverhard-verdeling — zo exporteer je een route die je echt wilt.",
      },
      {
        h: "Gratis, geen account",
        p: "Een GPX maken en exporteren kan zonder account. Een gratis login voegt alleen routes opslaan, collecties maken en anderen volgen toe.",
      },
    ],
    stepsHeading: "Zo maak je een GPX-bestand",
    steps: [
      "Open de routeplanner en zet een startpunt — voeg een bestemming toe, of maak met “Rondje” een lus.",
      "Kies je activiteit zodat de route passende wegen volgt.",
      "Sleep de lijn of voeg waypoints toe tot de route is zoals je wilt.",
      "Open Exporteer en kies GPX (of een turn-by-turn-koers).",
      "Zet het bestand op je GPS-apparaat, horloge of telefoon-app.",
    ],
    faqHeading: "Veelgestelde vragen",
    faq: [
      {
        q: "Is een GPX maken met Tarnoo gratis?",
        a: "Ja. Een route maken en de GPX exporteren is gratis en zonder account. Een gratis login voegt alleen optionele functies toe, zoals routes opslaan en collecties maken.",
      },
      {
        q: "Wat is een GPX-bestand?",
        a: "GPX is een standaard bestandsformaat dat een route beschrijft als een reeks GPS-punten. De meeste GPS-apparaten, sporthorloges en kaart-apps kunnen een GPX openen om de route te volgen.",
      },
      {
        q: "Kan ik een GPX importeren die ik al heb?",
        a: "Ja. Importeer een bestaande GPX in de planner om het hoogteprofiel en de ondergrond te bekijken, en pas de lijn aan als je 'm wilt wijzigen.",
      },
      {
        q: "Werkt de GPX op mijn Garmin of horloge?",
        a: "Ja. Je exporteert een gewone GPX-track of een turn-by-turn-koers en zet 'm op een Garmin, ander GPS-apparaat, sporthorloge of telefoon-app.",
      },
      {
        q: "Kan ik een GPX voor elke activiteit maken?",
        a: "Ja. Je plant en exporteert voor wandelen, hardlopen, fietsen (toer, gravel, racefiets en e-bike) en mountainbiken.",
      },
    ],
    relatedHeading: "Plan per activiteit",
    related: [
      { label: "Wandelroute maken", slug: "hiking-route-planner" },
      { label: "Fietsroute plannen", slug: "cycling-route-planner" },
      { label: "MTB-route plannen", slug: "mtb-route-planner" },
      { label: "Hardlooproute maken", slug: "running-route-planner" },
    ],
    closingHeading: "Maak je GPX",
    closingBody:
      "Open de planner, teken je route en exporteer de GPX. Geen account, geen kosten.",
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

export default function GpxPage({
  params,
}: {
  params: { locale: string };
}) {
  return (
    <ActivityPlannerLanding
      locale={params.locale}
      slug={SLUG}
      sport=""
      copy={COPY[params.locale === "nl" ? "nl" : "en"]}
    />
  );
}
