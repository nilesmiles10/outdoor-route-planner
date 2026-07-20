"use client";

// Server-fetched site settings, made available to client components via
// context — one cached fetch in the layout, brand in the initial HTML,
// zero client-side queries.
import { createContext, useContext } from "react";
import type { SiteSettings } from "@/lib/siteSettings";

const Ctx = createContext<SiteSettings>({
  site_name: "Outdoor Route Planner",
  tagline_nl: "Plan je volgende avontuur",
  tagline_en: "Plan your next adventure",
  logo_url: null,
});

export function SiteSettingsProvider({
  value,
  children,
}: {
  value: SiteSettings;
  children: React.ReactNode;
}) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSiteSettings(): SiteSettings {
  return useContext(Ctx);
}
