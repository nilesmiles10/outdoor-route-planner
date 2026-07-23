"use client";

// Server-fetched site settings, made available to client components via
// context — one cached fetch in the layout, brand in the initial HTML,
// zero client-side queries.
import { createContext, useContext } from "react";
import type { FooterPage, SiteSettings } from "@/lib/siteSettings";

type Ctx = SiteSettings & { footer_pages: FooterPage[] };

const SettingsCtx = createContext<Ctx>({
  site_name: "Tarnoo",
  tagline_nl: "Plan je volgende avontuur",
  tagline_en: "Plan your next adventure",
  logo_url: null,
  og_image_url: null,
  google_site_verification: null,
  footer_pages: [],
});

export function SiteSettingsProvider({
  value,
  children,
}: {
  value: Ctx;
  children: React.ReactNode;
}) {
  return <SettingsCtx.Provider value={value}>{children}</SettingsCtx.Provider>;
}

export function useSiteSettings(): Ctx {
  return useContext(SettingsCtx);
}
