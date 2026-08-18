import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Node-omgeving: deze tests dekken server-side SEO-logica (sitemap,
// zichtbaarheidsfilters), geen DOM-componenten. De "@/"-alias wordt hier
// handmatig gezet i.p.v. via vite-tsconfig-paths — die is ESM-only en kan
// niet uit een CJS-geladen config, en één dependency minder is winst.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
