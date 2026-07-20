"use client";

// Shared page footer — brand name from the admin-editable site settings
// (context, server-fed) instead of 8 hardcoded copies. Client component so
// it also works inside the client pages (discover/routes/feed/collections).
import { useSiteSettings } from "./SiteSettingsProvider";

export default function SiteFooter() {
  const s = useSiteSettings();
  return (
    <footer className="mt-16 border-t border-neutral-100 pt-4 text-xs text-neutral-400">
      © {new Date().getFullYear()} {s.site_name} ·{" "}
      <a href="https://www.openstreetmap.org/copyright" className="hover:underline">
        © OpenStreetMap contributors
      </a>
    </footer>
  );
}
