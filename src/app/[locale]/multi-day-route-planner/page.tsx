import type { Metadata } from "next";
import ActivityPlannerLanding, {
  type ActivityCopy,
} from "@/components/seo/ActivityPlannerLanding";
import { getSiteSettings, pageTitle } from "@/lib/siteSettings";
import { SITE_URL } from "@/app/sitemap";

// SEO landing page — "multi-day route planner" intent (meerdaagse tocht,
// hut-to-hut, bikepacking). Bouwt op de échte stage-split feature (GEN-121:
// "multi-day stage planner — split + per-stage stats/GPX"). Activiteit-
// agnostisch: geen trails-sectie, planner-CTA zonder sport. Alle claims uit het
// product (per-dag afstand/klim, per-stage GPX). Niets verzonnen.

export const revalidate = 86400;

const SLUG = "multi-day-route-planner";

const COPY: Record<"nl" | "en", ActivityCopy> = {
  en: {
    metaTitle: "Multi-day route planner",
    metaDescription:
      "Plan a multi-day hike or bikepacking trip across Europe — free, no account. Draw one long route and split it into day stages, each with its own distance and climbing, then export a GPX per stage.",
    h1: "Multi-day route planner",
    lede:
      "Tarnoo turns one long route into a clear day-by-day plan. Draw a long-distance walk, hut-to-hut trek or bikepacking trip anywhere in Europe, split it into day stages — each with its own distance and climbing — and export a GPX for every stage. Free, and no account needed to plan or export.",
    ctaPlan: "Plan a multi-day route",
    featuresHeading: "From one long line to a day-by-day plan",
    features: [
      {
        h: "Split into day stages",
        p: "Draw your full route, then split it into stages. Each stage gets its own distance and climbing, so a week-long trek becomes a plan you can actually pace instead of one intimidating line.",
      },
      {
        h: "A GPX per stage",
        p: "Export each day as its own GPX file, so you can load one stage at a time onto your GPS, watch or phone — or share the whole trip stage by stage.",
      },
      {
        h: "Hut-to-hut and bikepacking",
        p: "Plan a hut-to-hut hike or a multi-day bike tour by shaping the route through the places you want to overnight, then let the day split do the maths.",
      },
      {
        h: "Elevation and surface",
        p: "See the full elevation profile, the climbs, and the paved-versus-unpaved surface across the whole route — the things that decide how far you can realistically go each day.",
      },
      {
        h: "Any activity, all of Europe",
        p: "Works for hiking, cycling (touring, gravel, road, e-bike) and mountain biking, anywhere OpenStreetMap covers — which is the whole of Europe.",
      },
      {
        h: "Free, no sign-up",
        p: "Planning the route, splitting it into stages and exporting the GPX files needs no account. A free login only adds saving routes and collections.",
      },
    ],
    stepsHeading: "How to plan a multi-day route",
    steps: [
      "Draw your full route between start and finish, adding waypoints for the places you want to pass or overnight.",
      "Pick your activity — hiking, cycling or MTB.",
      "Split the route into day stages.",
      "Review each stage's distance and climbing, and adjust the route if a day is too long.",
      "Export a GPX for each stage and load it onto your device.",
    ],
    faqHeading: "Frequently asked questions",
    faq: [
      {
        q: "Is the multi-day planner free?",
        a: "Yes. Drawing a route, splitting it into day stages and exporting the GPX files are free and need no account. A free login only adds optional features like saving routes and collections.",
      },
      {
        q: "Can I plan a hut-to-hut hike?",
        a: "Yes. Shape the route through the huts or towns where you want to stop, then split it into day stages so each day's distance and climbing is clear.",
      },
      {
        q: "Can I use it for bikepacking?",
        a: "Yes. It works for cycling as well as hiking — plan a long tour, split it into daily stages, and export a GPX for each day.",
      },
      {
        q: "Do I get a separate GPX for each day?",
        a: "Yes. Each stage can be exported as its own GPX file, so you can load one day at a time onto your device.",
      },
      {
        q: "Which countries does it cover?",
        a: "All of Europe. Routing and route data come from OpenStreetMap.",
      },
    ],
    relatedHeading: "Related",
    related: [
      { label: "Hiking route planner", slug: "hiking-route-planner" },
      { label: "Cycling route planner", slug: "cycling-route-planner" },
      { label: "Make a GPX file", slug: "gpx" },
    ],
    closingHeading: "Plan your trip",
    closingBody:
      "Open the planner, draw your route, and split it into days. No account, no cost.",
    breadcrumbHome: "Home",
  },
  nl: {
    metaTitle: "Meerdaagse route plannen",
    metaDescription:
      "Plan gratis een meerdaagse wandeltocht of bikepacking-trip door Europa — geen account. Teken één lange route en splits 'm in dagetappes met per dag de afstand en het klimwerk, en exporteer een GPX per etappe.",
    h1: "Meerdaagse route plannen",
    lede:
      "Tarnoo maakt van één lange route een helder plan per dag. Teken een langeafstandswandeling, hut-tot-hut-tocht of bikepacking-trip ergens in Europa, splits 'm in dagetappes — elk met een eigen afstand en klimwerk — en exporteer een GPX voor elke etappe. Gratis, en zonder account om te plannen of exporteren.",
    ctaPlan: "Meerdaagse route plannen",
    featuresHeading: "Van één lange lijn naar een plan per dag",
    features: [
      {
        h: "Splits in dagetappes",
        p: "Teken je volledige route en splits 'm in etappes. Elke etappe krijgt een eigen afstand en klimwerk, zodat een weektocht een plan wordt dat je kunt doseren in plaats van één intimiderende lijn.",
      },
      {
        h: "Een GPX per etappe",
        p: "Exporteer elke dag als eigen GPX-bestand, zodat je één etappe tegelijk op je GPS, horloge of telefoon zet — of de hele trip etappe voor etappe deelt.",
      },
      {
        h: "Hut-tot-hut en bikepacking",
        p: "Plan een hut-tot-hut-wandeling of meerdaagse fietstocht door de route langs je overnachtingsplekken te sturen, en laat de dag-split het rekenwerk doen.",
      },
      {
        h: "Hoogte en ondergrond",
        p: "Zie het volledige hoogteprofiel, de klimmen en de verhard-versus-onverhard-verdeling over de hele route — precies wat bepaalt hoe ver je per dag realistisch komt.",
      },
      {
        h: "Elke activiteit, heel Europa",
        p: "Werkt voor wandelen, fietsen (toer, gravel, racefiets, e-bike) en mountainbiken, overal waar OpenStreetMap dekt — dat is heel Europa.",
      },
      {
        h: "Gratis, geen account",
        p: "De route plannen, in etappes splitsen en de GPX-bestanden exporteren kan zonder account. Een gratis login voegt alleen routes opslaan en collecties toe.",
      },
    ],
    stepsHeading: "Zo plan je een meerdaagse route",
    steps: [
      "Teken je volledige route tussen start en finish, met waypoints voor de plekken die je wilt passeren of overnachten.",
      "Kies je activiteit — wandelen, fietsen of MTB.",
      "Splits de route in dagetappes.",
      "Bekijk per etappe de afstand en het klimwerk, en pas de route aan als een dag te lang is.",
      "Exporteer een GPX voor elke etappe en zet 'm op je apparaat.",
    ],
    faqHeading: "Veelgestelde vragen",
    faq: [
      {
        q: "Is de meerdaagse planner gratis?",
        a: "Ja. Een route tekenen, in dagetappes splitsen en de GPX-bestanden exporteren is gratis en zonder account. Een gratis login voegt alleen optionele functies toe, zoals routes opslaan en collecties.",
      },
      {
        q: "Kan ik een hut-tot-hut-wandeling plannen?",
        a: "Ja. Stuur de route langs de hutten of plaatsen waar je wilt stoppen, en splits 'm dan in dagetappes zodat de afstand en het klimwerk per dag helder zijn.",
      },
      {
        q: "Kan ik het voor bikepacking gebruiken?",
        a: "Ja. Het werkt voor fietsen én wandelen — plan een lange tocht, splits 'm in dagelijkse etappes, en exporteer een GPX voor elke dag.",
      },
      {
        q: "Krijg ik een aparte GPX voor elke dag?",
        a: "Ja. Elke etappe kan als eigen GPX-bestand worden geëxporteerd, zodat je één dag tegelijk op je apparaat zet.",
      },
      {
        q: "Welke landen worden gedekt?",
        a: "Heel Europa. De routering en routedata komen uit OpenStreetMap.",
      },
    ],
    relatedHeading: "Gerelateerd",
    related: [
      { label: "Wandelroute maken", slug: "hiking-route-planner" },
      { label: "Fietsroute plannen", slug: "cycling-route-planner" },
      { label: "GPX maken", slug: "gpx" },
    ],
    closingHeading: "Plan je tocht",
    closingBody:
      "Open de planner, teken je route en splits 'm in dagen. Geen account, geen kosten.",
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

export default function MultiDayRoutePlannerPage({
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
