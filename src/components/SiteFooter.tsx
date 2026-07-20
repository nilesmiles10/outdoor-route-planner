"use client";

// Shared page footer — brand name from the admin-editable site settings
// (context, server-fed) instead of 8 hardcoded copies. Client component so
// it also works inside the client pages (discover/routes/feed/collections).
import { useLocale } from "next-intl";
import { useSiteSettings } from "./SiteSettingsProvider";

export default function SiteFooter() {
  const s = useSiteSettings();
  const locale = useLocale();
  return (
    <footer className="mt-16 border-t border-neutral-100 pt-4 text-xs text-neutral-400">
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
