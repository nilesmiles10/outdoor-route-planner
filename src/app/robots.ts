import type { MetadataRoute } from "next";
import { SITE_URL } from "./sitemap";

// GEN-145 Europa: trail-sitemaps zijn gesegmenteerd — robots somt ze op
// zodat zoekmachines ze vinden (Next maakt geen sitemap-index). Plain
// PostgREST-fetch: robots wordt (deels) op build-time geëvalueerd en
// supabaseServer/cookies() mag daar niet.
export const revalidate = 3600;

// 1000 = PostgREST max-rows; moet gelijk blijven aan PER_SEGMENT in
// trails-sitemap/ én highlights-sitemap/, anders mist of verzint robots
// segmenten.
const PER_SEGMENT = 1000;

async function segmentCount(query: string): Promise<number> {
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${query}`,
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
    return Math.max(1, Math.ceil(count / PER_SEGMENT));
  } catch {
    return 1; // fallback: één segment
  }
}

export default async function robots(): Promise<MetadataRoute.Robots> {
  const [trailSegments, highlightSegments] = await Promise.all([
    segmentCount("trails?select=id&limit=1"),
    segmentCount("highlights?select=id&kind=eq.point&limit=1"),
  ]);
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/embed"] },
    sitemap: [
      `${SITE_URL}/sitemap.xml`,
      ...Array.from(
        { length: trailSegments },
        (_, i) => `${SITE_URL}/trails-sitemap/sitemap/${i}.xml`,
      ),
      ...Array.from(
        { length: highlightSegments },
        (_, i) => `${SITE_URL}/highlights-sitemap/sitemap/${i}.xml`,
      ),
    ],
  };
}
