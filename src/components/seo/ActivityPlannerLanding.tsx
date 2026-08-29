import Link from "next/link";
import SiteFooter from "@/components/SiteFooter";
import { SITE_URL } from "@/app/sitemap";

// Shared renderer for the activity-specific "… route planner" SEO landing pages
// (hiking, cycling, MTB, running …). One layout + JSON-LD, per-activity copy.
// Server component; chrome (AppHeader) comes from the locale layout.
//
// Every field is real product copy passed in by the page — this component adds
// no claims of its own. JSON-LD is limited to truthful types: BreadcrumbList,
// FAQPage, and a free-web-app SoftwareApplication with NO invented ratings.

export type ActivityCopy = {
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
  relatedHeading?: string;
  related?: { label: string; slug: string }[];
};

export default function ActivityPlannerLanding({
  locale,
  slug,
  sport,
  trailsSport,
  copy: c,
}: {
  locale: string;
  slug: string;
  /** planner deep-link activity, e.g. "hike" | "touring" | "mtb" | "run" */
  sport: string;
  /** /trails sport filter, e.g. "hike" | "touring" | "mtb" (subset of planner sports) */
  trailsSport: string;
  copy: ActivityCopy;
}) {
  const base = `${SITE_URL}/${locale}`;
  const planHref = `/${locale}?sport=${sport}`;
  const trailsHref = `/${locale}/trails?sport=${trailsSport}`;

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
          item: `${base}/${slug}`,
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
      // Truthful subset only: free web app, no invented ratings.
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "Tarnoo",
      applicationCategory: "TravelApplication",
      operatingSystem: "Web",
      url: `${base}/${slug}`,
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
        <span aria-hidden>/</span>{" "}
        <span className="text-neutral-500">{c.metaTitle}</span>
      </nav>

      <h1 className="mt-3 text-2xl font-semibold text-neutral-900">{c.h1}</h1>
      <p className="mt-3 text-neutral-700">{c.lede}</p>

      <div className="mt-5 flex flex-wrap gap-3">
        <Link
          href={planHref}
          className="inline-flex items-center rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
        >
          {c.ctaPlan}
        </Link>
        <Link
          href={trailsHref}
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
          href={trailsHref}
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

      {c.related && c.related.length > 0 && (
        <>
          <h2 className="mt-10 text-lg font-semibold text-neutral-900">
            {c.relatedHeading}
          </h2>
          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {c.related.map((r) => (
              <li key={r.slug}>
                <Link
                  href={`/${locale}/${r.slug}`}
                  className="font-medium text-emerald-800 hover:underline"
                >
                  {r.label}
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      <section className="mt-10 rounded-xl bg-emerald-50 p-5">
        <h2 className="text-lg font-semibold text-emerald-900">
          {c.closingHeading}
        </h2>
        <p className="mt-1.5 text-sm text-emerald-800">{c.closingBody}</p>
        <Link
          href={planHref}
          className="mt-4 inline-flex items-center rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
        >
          {c.ctaPlan}
        </Link>
      </section>

      <SiteFooter />
    </main>
  );
}
