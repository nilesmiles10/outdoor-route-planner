import type { MetadataRoute } from "next";
import { SITE_URL } from "./sitemap";

// GEN-145 Europa: trail-sitemaps zijn gesegmenteerd — robots somt ze op
// zodat zoekmachines ze vinden (Next maakt geen sitemap-index). Plain
// PostgREST-fetch: robots wordt (deels) op build-time geëvalueerd en
// supabaseServer/cookies() mag daar niet.
export const revalidate = 3600;

export default async function robots(): Promise<MetadataRoute.Robots> {
  let segments = 1;
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/trails?select=id&limit=1`,
      {
        headers: {
          apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
          Prefer: "count=exact",
        },
        next: { revalidate: 3600 },
      },
    );
    const count =
      parseInt((res.headers.get("content-range") ?? "0/0").split("/")[1] ?? "0", 10) || 0;
    segments = Math.max(1, Math.ceil(count / 5000));
  } catch {
    // fallback: één segment
  }
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/embed"] },
    sitemap: [
      `${SITE_URL}/sitemap.xml`,
      ...Array.from(
        { length: segments },
        (_, i) => `${SITE_URL}/trails-sitemap/sitemap/${i}.xml`,
      ),
    ],
  };
}
