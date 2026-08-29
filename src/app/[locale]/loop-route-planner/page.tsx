import type { Metadata } from "next";
import ActivityPlannerLanding, {
  type ActivityCopy,
} from "@/components/seo/ActivityPlannerLanding";
import { getSiteSettings, pageTitle } from "@/lib/siteSettings";
import { SITE_URL } from "@/app/sitemap";

// SEO landing page — loop/round-trip intent ("circular walk planner", "loop
// route generator", "rondje maken", "rondje van X km"). Bouwt op de échte
// round-trip-generator (GEN-107 / lib/roundtrip loopVias): zet een afstand +
// startpunt → genereert een lus van ~die lengte terug naar start; "Ander
// rondje" geeft variaties. Activiteit-agnostisch. Alle claims uit het product.

export const revalidate = 86400;

const SLUG = "loop-route-planner";

const COPY: Record<"nl" | "en", ActivityCopy> = {
  en: {
    metaTitle: "Loop route planner — round trips from your door",
    metaDescription:
      "Generate a circular route of the length you want — free, no account. Set a start point and a distance, and Tarnoo builds a loop that returns to where you began. Works for walking, running, cycling and MTB.",
    h1: "Loop route planner",
    lede:
      "Want a route that comes back to where you started? Set a start point and how long you want the loop to be, and Tarnoo generates a round trip of about that distance. Don't love it? Generate another variation, or drag the line to fine-tune it. Then export a GPX. Free, and no account needed.",
    ctaPlan: "Generate a loop",
    featuresHeading: "Round trips, made easy",
    features: [
      {
        h: "Set a distance, get a loop",
        p: "Choose a start point and a target distance, and Tarnoo builds a circular route of about that length that brings you back to the start — no need to draw the whole thing yourself.",
      },
      {
        h: "Not quite right? Try another",
        p: "One tap generates a different loop of the same length from the same start, so you can flick through variations until one fits — a fresh route even from your own front door.",
      },
      {
        h: "Walking, running, cycling, MTB",
        p: "Pick your activity and the loop follows ways that suit it — footpaths for a walk or run, cycle-friendly ways for a ride, tracks and trails for MTB.",
      },
      {
        h: "Elevation and surface",
        p: "See the loop's elevation profile, its climbs, and how much is paved versus unpaved before you head out.",
      },
      {
        h: "Adjust and export",
        p: "Drag the generated line or add a waypoint to route it past a spot you like, then export a GPX for your watch, GPS or phone.",
      },
      {
        h: "Free, no sign-up",
        p: "Generating a loop and exporting the GPX needs no account. A free login only adds saving routes and collections.",
      },
    ],
    stepsHeading: "How to make a loop route",
    steps: [
      "Enter your start point — your home, a car park, a café.",
      "Pick your activity and set how long you want the loop to be.",
      "Generate the round trip.",
      "Not quite right? Generate another variation, or drag the line to adjust it.",
      "Export a GPX for your device.",
    ],
    faqHeading: "Frequently asked questions",
    faq: [
      {
        q: "Is the loop route planner free?",
        a: "Yes. Generating a round trip and exporting the GPX are free and need no account. A free login only adds optional features like saving routes and collections.",
      },
      {
        q: "Can I make a loop of a specific distance from my house?",
        a: "Yes. Set your start point and a target distance, and Tarnoo generates a circular route of about that length that returns to where you started.",
      },
      {
        q: "Can I get a different loop if I don't like the first one?",
        a: "Yes. You can generate another variation of the same length from the same start, as many times as you like, and drag the line to fine-tune it.",
      },
      {
        q: "Does it work for running and cycling too?",
        a: "Yes. Choose walking, running, cycling (touring, gravel, road, e-bike) or mountain biking, and the loop follows ways suited to that activity.",
      },
      {
        q: "Can I export the loop as a GPX?",
        a: "Yes. Export it as a GPX file or a turn-by-turn course for your watch, GPS device or a phone app.",
      },
    ],
    relatedHeading: "Related",
    related: [
      { label: "Running route planner", slug: "running-route-planner" },
      { label: "Hiking route planner", slug: "hiking-route-planner" },
      { label: "Cycling route planner", slug: "cycling-route-planner" },
      { label: "Make a GPX file", slug: "gpx" },
    ],
    closingHeading: "Make your loop",
    closingBody:
      "Open the planner, set a start and a distance, and generate a round trip. No account, no cost.",
    breadcrumbHome: "Home",
  },
  nl: {
    metaTitle: "Rondje maken — routeplanner voor rondjes",
    metaDescription:
      "Genereer een rondje van de lengte die je wilt — gratis, geen account. Zet een startpunt en een afstand, en Tarnoo maakt een lus die terugkomt bij je start. Werkt voor wandelen, hardlopen, fietsen en MTB.",
    h1: "Rondje maken",
    lede:
      "Wil je een route die terugkomt bij je startpunt? Zet een startpunt en kies hoe lang het rondje moet zijn, en Tarnoo genereert een lus van ongeveer die afstand. Niet helemaal naar wens? Genereer een andere variatie, of sleep de lijn om 'm bij te stellen. Exporteer daarna een GPX. Gratis, en zonder account.",
    ctaPlan: "Genereer een rondje",
    featuresHeading: "Rondjes, simpel gemaakt",
    features: [
      {
        h: "Zet een afstand, krijg een rondje",
        p: "Kies een startpunt en een gewenste afstand, en Tarnoo bouwt een rondje van ongeveer die lengte dat je terugbrengt bij je start — je hoeft het niet zelf helemaal te tekenen.",
      },
      {
        h: "Niet goed? Probeer een ander",
        p: "Eén tik genereert een ander rondje van dezelfde lengte vanaf hetzelfde punt, zodat je door variaties bladert tot er één past — een vers rondje, zelfs vanaf je eigen voordeur.",
      },
      {
        h: "Wandelen, hardlopen, fietsen, MTB",
        p: "Kies je activiteit en het rondje volgt passende wegen — voetpaden voor een wandeling of run, fietsvriendelijke wegen voor een rit, tracks en trails voor MTB.",
      },
      {
        h: "Hoogte en ondergrond",
        p: "Zie het hoogteprofiel van het rondje, de klimmen, en hoeveel verhard versus onverhard is voordat je vertrekt.",
      },
      {
        h: "Aanpassen en exporteren",
        p: "Sleep de gegenereerde lijn of voeg een waypoint toe om 'm langs een fijne plek te sturen, en exporteer daarna een GPX voor je horloge, GPS of telefoon.",
      },
      {
        h: "Gratis, geen account",
        p: "Een rondje genereren en de GPX exporteren kan zonder account. Een gratis login voegt alleen routes opslaan en collecties toe.",
      },
    ],
    stepsHeading: "Zo maak je een rondje",
    steps: [
      "Voer je startpunt in — je huis, een parkeerplaats, een café.",
      "Kies je activiteit en stel in hoe lang het rondje moet zijn.",
      "Genereer het rondje.",
      "Niet goed? Genereer een andere variatie, of sleep de lijn om 'm aan te passen.",
      "Exporteer een GPX voor je apparaat.",
    ],
    faqHeading: "Veelgestelde vragen",
    faq: [
      {
        q: "Is de rondje-planner gratis?",
        a: "Ja. Een rondje genereren en de GPX exporteren is gratis en zonder account. Een gratis login voegt alleen optionele functies toe, zoals routes opslaan en collecties.",
      },
      {
        q: "Kan ik een rondje van een bepaalde afstand vanaf mijn huis maken?",
        a: "Ja. Zet je startpunt en een gewenste afstand, en Tarnoo genereert een rondje van ongeveer die lengte dat terugkomt bij je start.",
      },
      {
        q: "Kan ik een ander rondje krijgen als het eerste niet bevalt?",
        a: "Ja. Je genereert net zo vaak als je wilt een andere variatie van dezelfde lengte vanaf hetzelfde startpunt, en je sleept de lijn om 'm bij te stellen.",
      },
      {
        q: "Werkt het ook voor hardlopen en fietsen?",
        a: "Ja. Kies wandelen, hardlopen, fietsen (toer, gravel, racefiets, e-bike) of mountainbiken, en het rondje volgt wegen die bij die activiteit passen.",
      },
      {
        q: "Kan ik het rondje als GPX exporteren?",
        a: "Ja. Exporteer het als GPX-bestand of turn-by-turn-koers voor je horloge, GPS-apparaat of telefoon-app.",
      },
    ],
    relatedHeading: "Gerelateerd",
    related: [
      { label: "Hardlooproute maken", slug: "running-route-planner" },
      { label: "Wandelroute maken", slug: "hiking-route-planner" },
      { label: "Fietsroute plannen", slug: "cycling-route-planner" },
      { label: "GPX maken", slug: "gpx" },
    ],
    closingHeading: "Maak je rondje",
    closingBody:
      "Open de planner, zet een start en een afstand, en genereer een rondje. Geen account, geen kosten.",
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

export default function LoopRoutePlannerPage({
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
