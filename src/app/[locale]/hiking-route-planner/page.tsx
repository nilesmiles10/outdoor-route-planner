import type { Metadata } from "next";
import Link from "next/link";
import SiteFooter from "@/components/SiteFooter";
import { getSiteSettings, pageTitle } from "@/lib/siteSettings";
import { SITE_URL } from "@/app/sitemap";

// SEO landing page — "hiking route planner" intent (nl: wandelroute maken).
// Bewust NIET de generieke "routeplanner"-intentie: die dekt de homepage al
// (kannibalisatie). Deze pagina is wandel-specifiek: officiële wandelroutes,
// hoogte/klim, ondergrond, meerdaags, GPX. Alle claims staan 1-op-1 in het
// product (zie seo/SEO_BACKLOG.md → product facts); niets verzonnen.
//
// Server component, zelfde patroon als /trails: generateMetadata + pageTitle +
// self-canonical + SiteFooter. Chrome (AppHeader) komt uit de locale-layout.

export const revalidate = 86400;

const SLUG = "hiking-route-planner";

type Copy = {
  metaTitle: string;
  metaDescription: string;
  h1: string;
  lede: string;
  ctaPlan: string;
  ctaTrails: string;
  featuresHeading: string;
  features: { h: string; p: string }[];
  stepsHeading: string;
  steps: string[];
  trailsHeading: string;
  trailsBody: string;
  faqHeading: string;
  faq: { q: string; a: string }[];
  closingHeading: string;
  closingBody: string;
  breadcrumbHome: string;
};

const COPY: Record<"nl" | "en", Copy> = {
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
  const nl = params.locale === "nl";
  const c = COPY[nl ? "nl" : "en"];
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

export default async function HikingRoutePlannerPage({
  params,
}: {
  params: { locale: string };
}) {
  const { locale } = params;
  const nl = locale === "nl";
  const c = COPY[nl ? "nl" : "en"];
  const base = `${SITE_URL}/${locale}`;

  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: c.breadcrumbHome, item: base },
        {
          "@type": "ListItem",
          position: 2,
          name: c.metaTitle,
          item: `${base}/${SLUG}`,
        },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: c.faq.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    },
    {
      // Truthful subset only: it is a free web app. No ratings (would be invented).
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "Tarnoo",
      applicationCategory: "TravelApplication",
      operatingSystem: "Web",
      url: `${base}/${SLUG}`,
      offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
    },
  ];

  return (
    <main className="mx-auto min-h-dvh max-w-3xl px-4 pb-16 pt-20">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <nav className="text-xs text-neutral-400">
        <Link href={`/${locale}`} className="hover:underline">
          {c.breadcrumbHome}
        </Link>{" "}
        <span aria-hidden>/</span> <span className="text-neutral-500">{c.metaTitle}</span>
      </nav>

      <h1 className="mt-3 text-2xl font-semibold text-neutral-900">{c.h1}</h1>
      <p className="mt-3 text-neutral-700">{c.lede}</p>

      <div className="mt-5 flex flex-wrap gap-3">
        <Link
          href={`/${locale}?sport=hike`}
          className="inline-flex items-center rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
        >
          {c.ctaPlan}
        </Link>
        <Link
          href={`/${locale}/trails?sport=hike`}
          className="inline-flex items-center rounded-lg border border-emerald-700 px-4 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-50"
        >
          {c.ctaTrails}
        </Link>
      </div>

      <h2 className="mt-10 text-lg font-semibold text-neutral-900">
        {c.featuresHeading}
      </h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {c.features.map((f) => (
          <section
            key={f.h}
            className="rounded-xl border border-neutral-100 bg-white p-4"
          >
            <h3 className="text-sm font-semibold text-neutral-900">{f.h}</h3>
            <p className="mt-1.5 text-sm text-neutral-600">{f.p}</p>
          </section>
        ))}
      </div>

      <h2 className="mt-10 text-lg font-semibold text-neutral-900">
        {c.stepsHeading}
      </h2>
      <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-neutral-700 marker:text-emerald-700">
        {c.steps.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>

      <h2 className="mt-10 text-lg font-semibold text-neutral-900">
        {c.trailsHeading}
      </h2>
      <p className="mt-3 text-sm text-neutral-700">
        {c.trailsBody}{" "}
        <Link
          href={`/${locale}/trails?sport=hike`}
          className="font-medium text-emerald-800 hover:underline"
        >
          {c.ctaTrails}
        </Link>
        .
      </p>

      <h2 className="mt-10 text-lg font-semibold text-neutral-900">
        {c.faqHeading}
      </h2>
      <dl className="mt-4 space-y-4">
        {c.faq.map((f) => (
          <div key={f.q}>
            <dt className="text-sm font-semibold text-neutral-900">{f.q}</dt>
            <dd className="mt-1 text-sm text-neutral-600">{f.a}</dd>
          </div>
        ))}
      </dl>

      <section className="mt-10 rounded-xl bg-emerald-50 p-5">
        <h2 className="text-lg font-semibold text-emerald-900">
          {c.closingHeading}
        </h2>
        <p className="mt-1.5 text-sm text-emerald-800">{c.closingBody}</p>
        <Link
          href={`/${locale}?sport=hike`}
          className="mt-4 inline-flex items-center rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
        >
          {c.ctaPlan}
        </Link>
      </section>

      <SiteFooter />
    </main>
  );
}
