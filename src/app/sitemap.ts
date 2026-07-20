import type { MetadataRoute } from "next";
import { supabaseServer } from "@/lib/supabase/server";

// Dynamic sitemap over all public content (tours, highlights, collections),
// both locales. Until the brand domain exists we advertise the Vercel URL.
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ??
  "https://outdoor-route-planner-seven.vercel.app";

export const revalidate = 3600;

const LOCALES = ["nl", "en"];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const sb = supabaseServer();
  const [tours, highlights, collections] = await Promise.all([
    sb.from("tours").select("id,updated_at").eq("visibility", "public").limit(1000),
    sb.from("highlights").select("id").eq("kind", "point").limit(5000),
    sb
      .from("collections")
      .select("id,updated_at")
      .eq("visibility", "public")
      .limit(1000),
  ]);

  const entries: MetadataRoute.Sitemap = [];
  for (const locale of LOCALES) {
    entries.push(
      { url: `${SITE_URL}/${locale}`, changeFrequency: "weekly", priority: 1 },
      {
        url: `${SITE_URL}/${locale}/discover`,
        changeFrequency: "daily",
        priority: 0.9,
      },
      {
        url: `${SITE_URL}/${locale}/collections`,
        changeFrequency: "weekly",
        priority: 0.8,
      },
    );
    for (const t of tours.data ?? []) {
      entries.push({
        url: `${SITE_URL}/${locale}/tour/${t.id}`,
        lastModified: t.updated_at,
        changeFrequency: "weekly",
        priority: 0.8,
      });
    }
    for (const h of highlights.data ?? []) {
      entries.push({
        url: `${SITE_URL}/${locale}/highlight/${h.id}`,
        changeFrequency: "weekly",
        priority: 0.6,
      });
    }
    for (const c of collections.data ?? []) {
      entries.push({
        url: `${SITE_URL}/${locale}/collection/${c.id}`,
        lastModified: c.updated_at,
        changeFrequency: "weekly",
        priority: 0.7,
      });
    }
  }
  return entries;
}
