import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// CDN-caching voor bezoeker-onafhankelijke publieke pagina's.
//
// Reden (gemeten 2026-08-19): 35 GB Supabase-egress in één maand, vrijwel
// alleen crawler-verkeer tegen de pagina's die de sitemap sinds de
// SEO-uitbreiding aanbiedt (30k trails, 3,6k regio×categorie, 443 regio's).
// Elke trail-pagina trekt een 12 kB-geometrierij + een bbox-highlights-query
// (tot 1000 rijen). ISR cachet de render al, maar zonder deze header
// revalideert de rand agressief en her-query't Supabase bij elke her-crawl.
//
// s-maxage=3600 + stale-while-revalidate=86400: 1 uur vers aan de rand, daarna
// tot 24 uur stale-vanaf-de-rand met één achtergrond-revalidatie. Zo blijft een
// her-crawl binnen de dag een rand-hit i.p.v. een Supabase-query, en is de
// staleness (bv. na een admin-hide van een trail) tot 1 uur begrensd.
//
// Vercel-/CDN-Cache-Control worden door Next NIET overschreven; een gewone
// Cache-Control wél op dynamische routes (Next zet daar "private, no-store").
// Gemeten na de deploy van 2026-08-18: gewone Cache-Control verdween in
// productie, de CDN-varianten bleven staan en gaven x-vercel-cache HIT.
const CDN_CACHE = [
  {
    key: "Vercel-CDN-Cache-Control",
    value: "public, s-maxage=3600, stale-while-revalidate=86400",
  },
  {
    key: "CDN-Cache-Control",
    value: "public, s-maxage=3600, stale-while-revalidate=86400",
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        // Basis security-headers op álle routes (HSTS zet Vercel al).
        // nosniff = geen MIME-sniffing; Referrer-Policy lekt geen volledige
        // URL naar cross-origin bestemmingen.
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      // ── CDN-cache: ALLEEN bezoeker-onafhankelijke routes ────────────────────
      // Deze vier lezen allemaal via plain anon PostgREST-fetch — geen
      // supabaseServer()/cookies, dus dezelfde render voor iedereen. Zou een van
      // hen weer een sessie gaan lezen, dan lekt deze cache de render van de ene
      // bezoeker naar de andere; dan moet de bron hier weg. /tour en /collection
      // staan er bewust NIET bij: die zijn RLS-afgeschermd (privé-content) en
      // moeten sessie-bewust blijven. Vaste-diepte patronen zodat niets dubbel
      // matcht; paginering (?page=N) zit in de query, niet in het pad.
      {
        // /trails leest searchParams (filters) → dynamisch, zonder deze header
        // nooit gecacht.
        source: "/:locale(nl|en)/trails",
        headers: CDN_CACHE,
      },
      {
        source: "/:locale(nl|en)/trail/:id",
        headers: CDN_CACHE,
      },
      {
        source: "/:locale(nl|en)/trails/:region",
        headers: CDN_CACHE,
      },
      {
        source: "/:locale(nl|en)/discover/:region/:category",
        headers: CDN_CACHE,
      },
      // ───────────────────────────────────────────────────────────────────────
      {
        // Clickjacking-bescherming overal BEHALVE de /embed-widget: die moet
        // juist door derden ge-iframe't kunnen worden (dat is z'n functie).
        // Negatieve lookahead sluit /embed(/...) uit; de rest krijgt SAMEORIGIN.
        source: "/((?!embed).*)",
        headers: [{ key: "X-Frame-Options", value: "SAMEORIGIN" }],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
