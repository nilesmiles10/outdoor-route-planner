import { cache } from "react";

// Admin-editable site settings (single row, public-read RLS). Fetched with
// plain fetch — NOT supabaseServer(): cookies() would force every consumer
// dynamic and kill caching in generateMetadata. The Next data cache holds
// it for 5 min; the admin save action busts the tag so edits are instant.

export type SiteSettings = {
  site_name: string;
  tagline_nl: string;
  tagline_en: string;
  logo_url: string | null;
  og_image_url: string | null;
  google_site_verification: string | null;
};

export type FooterPage = { slug: string; title_nl: string; title_en: string };

const FALLBACK: SiteSettings = {
  site_name: "Outdoor Route Planner",
  tagline_nl: "Plan je volgende avontuur",
  tagline_en: "Plan your next adventure",
  logo_url: null,
  og_image_url: null,
  google_site_verification: null,
};

export const getSiteSettings = cache(async (): Promise<SiteSettings> => {
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/site_settings?id=eq.1&select=site_name,tagline_nl,tagline_en,logo_url,og_image_url,google_site_verification`,
      {
        headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! },
        next: { revalidate: 300, tags: ["site-settings"] },
      },
    );
    if (!res.ok) return FALLBACK;
    const rows = (await res.json()) as SiteSettings[];
    return rows[0] ?? FALLBACK;
  } catch {
    return FALLBACK;
  }
});

// Published footer pages (privacy/terms/about) — same cached-fetch pattern.
export const getFooterPages = cache(async (): Promise<FooterPage[]> => {
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/pages?published=eq.true&show_in_footer=eq.true&select=slug,title_nl,title_en&order=slug`,
      {
        headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! },
        next: { revalidate: 300, tags: ["pages"] },
      },
    );
    if (!res.ok) return [];
    return (await res.json()) as FooterPage[];
  } catch {
    return [];
  }
});

export function pageTitle(s: SiteSettings, prefix?: string): string {
  return prefix ? `${prefix} | ${s.site_name}` : s.site_name;
}

export function tagline(s: SiteSettings, locale: string): string {
  return locale === "nl" ? s.tagline_nl : s.tagline_en;
}
