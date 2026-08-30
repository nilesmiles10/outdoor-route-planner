# Tarnoo — Claude operating file

**Tarnoo** ([tarnoo.com](https://tarnoo.com)) is a **web-first outdoor route
planner for Europe**, built on OpenStreetMap. Package name `tarnoo`, v0.1.0.

**Main objective:** become the most complete and useful web-first outdoor route
planner for Europe (a real Komoot competitor — see `@docs/claude/GOAL.md`).

## Strategic documents

- `@docs/claude/GOAL.md` — permanent product goal + success dimensions
- `@docs/claude/ROADMAP.md` — NOW / NEXT / LATER / DO NOT BUILD
- `@docs/claude/EUROPE_COMPLETENESS.md` — per-country coverage scorecard
- `@docs/claude/SEO_GAPS.md` — SEO audit + opportunities
- `@docs/claude/ROUTING_GAPS.md` — routing-quality gaps + torture tests
- `@docs/claude/COMPETITOR_GAPS.md` — competitor capability matrix

Update the relevant document after any meaningful work. Run one improvement
iteration with `/europe`, `/seo`, `/routing`, or `/competitor`.

## Verified architecture (from the repository)

- **Frontend:** Next.js 14 (App Router) + TypeScript + Tailwind. Deployed on Vercel (`fra1`). Rendering: server components + ISR, with `Vercel-CDN-Cache-Control` on visitor-independent public routes (`next.config.mjs`).
- **i18n:** next-intl, locales `en` + `nl`, `[locale]`-prefixed routes, shared segment slugs (no localized pathnames). hreflang via the next-intl HTTP `Link` header (not `alternates.languages`).
- **Map:** MapLibre GL JS + OpenFreeMap vector tiles; `@protomaps/basemaps` + `pmtiles` present.
- **Routing:** self-hosted **BRouter** (VPS), proxied by `/api/geo/route` (`GEO_ROUTE_BASE`). 7 sports → BRouter profiles (`src/lib/geo.ts` `SPORT_PROFILES`). Single route only (`alternativeidx=0`).
- **Geocoding:** self-hosted **Photon** (VPS), proxied by `/api/geo/search` + `/api/geo/reverse`.
- **Backend/data:** Supabase (Postgres, EU; project `ivpkstpkzbbrttkqaops`) for auth + content. All geodata from **OpenStreetMap**. DB schema is **not** in the repo (managed in Supabase); `scripts/` holds the OSM import pipeline (`import-trails.ts`, `import-highlights.ts`, `run-europe.sh`).
- **Activities (7):** hike, run, touring, gravel, road, ebike, mtb. (`walking` = `hike`; `run` and `ebike` reuse other profiles — see ROUTING_GAPS.)
- **Import/export:** GPX export (`src/lib/gpx.ts`, `ExportMenu`), turn-by-turn course; GPX + **FIT** import (`@garmin/fitsdk`, `fit-file-parser`).
- **Structured data:** WebSite, ItemList, BreadcrumbList, Trip, Place, TouristAttraction, GeoCoordinates, Person, FAQPage.

## Commands future sessions need

```bash
npm run dev      # local (http://localhost:3000/en or /nl)
npm run build    # production build — run before deploy
npm run lint     # eslint (next lint)
npx tsc --noEmit # typecheck
npm run test     # vitest (src/**/*.test.ts) — SEO guards + stages; NO routing tests yet
```
Local geo-services need an SSH tunnel to the VPS (see `.env.example`).
Deploy = push to `main` (Vercel auto-deploys). Verify on `tarnoo.com` (cache-bust when checking fresh renders).

## Operating principles

- **Inspect before implementing.** Do not assume a feature is missing — grep/read first.
- **Fix root causes**, not single example routes; prefer **reusable systems** over country-specific hacks.
- **Never fabricate** route, geographic, trail, or competitor data. **UNKNOWN is better than an invented answer.**
- **Preserve planner speed and mobile usability.** Check **European impact** (does a change help many countries?) and **SEO impact** where relevant.
- **Update the appropriate strategic document** after meaningful work.
- One iteration = one meaningful problem. Do not batch huge multi-feature changes.
