import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["en", "nl"],
  defaultLocale: "en",
  // next-intl sets NEXT_LOCALE on every request by default, and a response
  // that sets a cookie can never be CDN-cached — that alone kept all ~60k
  // trail URLs at x-vercel-cache: MISS and re-rendered per crawler hit.
  // AppHeader writes NEXT_LOCALE itself when the user switches language, so
  // the preference still persists; only next-intl's automatic write is off.
  localeCookie: false,
});
