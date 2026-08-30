"use client";

// Shared page footer — brand name from the admin-editable site settings
// (context, server-fed) instead of 8 hardcoded copies. Client component so
// it also works inside the client pages (discover/routes/feed/collections).
import { useLocale } from "next-intl";
import { useSiteSettings } from "./SiteSettingsProvider";

// Site-brede interne links naar de use-case landingspagina's. In de footer op
// élke pagina → distribueert linkwaarde en maakt ze vindbaar. Beschrijvende
// anchor-tekst (geen "klik hier"). Labels bilinguaal, gelijk aan de pagina's.
const PLANNER_LINKS: { slug: string; nl: string; en: string }[] = [
  { slug: "hiking-route-planner", nl: "Wandelroute maken", en: "Hiking route planner" },
  { slug: "cycling-route-planner", nl: "Fietsroute plannen", en: "Cycling route planner" },
  { slug: "mtb-route-planner", nl: "MTB-route plannen", en: "MTB route planner" },
  { slug: "running-route-planner", nl: "Hardlooproute maken", en: "Running route planner" },
  { slug: "loop-route-planner", nl: "Rondje maken", en: "Loop route planner" },
  { slug: "multi-day-route-planner", nl: "Meerdaagse route plannen", en: "Multi-day route planner" },
  { slug: "gpx", nl: "GPX maken", en: "Make a GPX file" },
];

export default function SiteFooter() {
  const s = useSiteSettings();
  const locale = useLocale();
  const nl = locale === "nl";
  return (
    <footer className="mt-16 border-t border-neutral-100 pt-4 text-xs text-neutral-400">
      <nav aria-label={nl ? "Routeplanners" : "Route planners"} className="mb-3">
        <span className="font-medium text-neutral-500">
          {nl ? "Routes plannen" : "Plan a route"}
        </span>
        <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
          {PLANNER_LINKS.map((l) => (
            <li key={l.slug}>
              <a href={`/${locale}/${l.slug}`} className="hover:underline hover:text-neutral-600">
                {nl ? l.nl : l.en}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      © {new Date().getFullYear()} {s.site_name} ·{" "}
      <a href="https://www.openstreetmap.org/copyright" className="hover:underline">
        © OpenStreetMap contributors
      </a>
      {s.footer_pages.map((p) => (
        <span key={p.slug}>
          {" · "}
          <a href={`/${locale}/${p.slug}`} className="hover:underline">
            {locale === "nl" ? p.title_nl : p.title_en}
          </a>
        </span>
      ))}
    </footer>
  );
}
