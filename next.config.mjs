import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

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
      {
        // /trails is dynamisch (leest searchParams) en werd daardoor nóóit door
        // de CDN gecacht: x-vercel-cache MISS bij drie opeenvolgende hits, 631 kB
        // en een volledige Supabase-query per request — op de instap-pagina van
        // 30k trail-pagina's. Met deze header cachet de CDN per volledige URL,
        // dus per filtercombinatie, en serveert hij verouderd terwijl hij
        // ververst.
        //
        // Mag alleen omdat de render sinds supabasePublic() bezoeker-onafhankelijk
        // is. Zou hij weer cookies gaan lezen, dan lekt deze cache de render van
        // de ene bezoeker naar de andere — zie de comment bij supabasePublic().
        // De regio-pagina's (/trails/<regio>) matchen hier niet: die hebben een
        // extra segment en cachen al via ISR.
        source: "/:locale(nl|en)/trails",
        headers: [
          // Alléén de CDN-varianten. Een gewone Cache-Control werkt hier NIET:
          // de route leest searchParams en wordt dus dynamisch gerenderd, en
          // Next overschrijft Cache-Control voor dynamische routes met
          // "private, no-cache, no-store". Gemeten na de deploy van 2026-08-18:
          // header uit next.config weg, x-vercel-cache MISS bij drie hits.
          // (Lokaal gaf next start een vals positief — die override doet-ie niet.)
          //
          // Vercel-CDN-Cache-Control en CDN-Cache-Control stuurt Next niet aan;
          // die zijn juist bedoeld om de edge-cache los van de browser-cache te
          // regelen, zodat dynamische routes tóch cachebaar zijn. De browser
          // blijft dus revalideren, de CDN niet.
          {
            key: "Vercel-CDN-Cache-Control",
            value: "public, s-maxage=3600, stale-while-revalidate=86400",
          },
          {
            key: "CDN-Cache-Control",
            value: "public, s-maxage=3600, stale-while-revalidate=86400",
          },
        ],
      },
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
