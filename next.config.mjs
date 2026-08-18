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
