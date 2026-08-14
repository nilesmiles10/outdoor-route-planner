import type { MetadataRoute } from "next";
import { getSiteSettings } from "@/lib/siteSettings";

// PWA-manifest: maakt Tarnoo installeerbaar ("Zet op beginscherm") als een
// standalone, app-achtige ervaring — waardevol voor een mobiel-eerst outdoor-
// app die je onderweg gebruikt. Next injecteert automatisch <link rel="manifest">.
// Iconen verwijzen naar de bestaande favicon-routes; Chrome accepteert een SVG
// met sizes:"any" voor installeerbaarheid, iOS gebruikt de apple-touch-icon.
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const s = await getSiteSettings();
  return {
    name: s.site_name,
    short_name: s.site_name,
    description: s.tagline_en,
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ecfdf5",
    theme_color: "#047857",
    icons: [
      { src: "/icon.svg", type: "image/svg+xml", sizes: "any", purpose: "any" },
      { src: "/apple-icon", type: "image/png", sizes: "180x180" },
      // Android adaptive (maskable): schone launcher-mask zonder witte rand.
      {
        src: "/icon-512-maskable",
        type: "image/png",
        sizes: "512x512",
        purpose: "maskable",
      },
    ],
  };
}
