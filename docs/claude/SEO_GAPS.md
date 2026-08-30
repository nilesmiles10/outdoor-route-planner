# SEO Gaps — repository audit

Run with `/seo`. Detailed backlog/log: `seo/SEO_BACKLOG.md`, `seo/SEO_CHANGELOG.md`.

## Current SEO architecture (verified)

- **Rendering:** server components + ISR; visitor-independent public routes carry `Vercel-CDN-Cache-Control: s-maxage=3600, stale-while-revalidate=86400` (`next.config.mjs`) to keep crawler hits on the CDN edge (added after 35 GB/mo Supabase crawler egress).
- **i18n / hreflang:** `en` + `nl`, `[locale]` prefix; hreflang emitted **per-page via the next-intl HTTP `Link` header** (layout deliberately omits `alternates.languages`).
- **Canonicals:** self-canonical on filtered pages (`/trails`, `/discover`, planner) to consolidate query-param variants. Guarded by tests (`src/lib/seo/canonical-guard.test.ts`).
- **Sitemaps:** dynamic `src/app/sitemap.ts` (tours, region×category combos, trail regions paged, CMS pages, landing pages) + **segmented** `trails-sitemap/` and `highlights-sitemap/` (PostgREST 1000-row cap handled). `robots.ts` enumerates the segments (Next builds no sitemap index).
- **Thin-content gating:** ~500k OSM highlights are mostly **noindex**; only content-rich ones (≥1 tip/photo) are indexed + in the highlights-sitemap. Region/category pages gated by `n ≥ 8` (`MIN_ITEMS`); trail regions by `MIN_TRAILS_PER_REGION`.
- **Structured data:** WebSite (home), ItemList (trails/discover), BreadcrumbList, Trip (tour/trail), Place + TouristAttraction + GeoCoordinates (highlight), Person (tour author), FAQPage + SoftwareApplication (landing pages).
- **Page templates:** planner home `/[locale]`; `/trails` (+ `/trails/[region]`); `/discover` (+ `/discover/[region]/[category]`); `/collections`, `/collection/[id]`; `/tour/[id]`, `/trail/[id]`, `/highlight/[id]`, `/user/[id]`; CMS `/[slug]`; **use-case landing cluster** (`hiking-/cycling-/mtb-/running-route-planner`, `gpx`, `multi-day-`, `loop-route-planner`), each nl+en.
- **Metadata:** per-page `generateMetadata` + `pageTitle()`; OG tags; per-entity OG images on tour/trail/collection/highlight.
- **Tests:** SEO guards exist — canonical, sitemap-privacy, visibility-guard, tour-access, tour-metadata.

## Existing SEO strengths

- Segmented, quota-safe sitemaps over real data; correct noindex gating (no thin-content flooding).
- Clean canonical + hreflang discipline, test-guarded.
- Rich, accurate structured data per entity type.
- Programmatic region×category + region pages already exist (data-gated).
- Use-case landing cluster with FAQ/SoftwareApplication schema, sitewide footer links, intro+FAQ on `/trails` and `/discover`.

## SEO gaps

| Gap | Type | Evidence | Search opportunity | User value | SEO value | Effort | Priority | Status |
|---|---|---|---|---|---|---|---|---|
| Per-page OG images for landing pages | Technical | Landing pages use generic site OG (`ActivityPlannerLanding`); detail pages have custom OG | Low (CTR) | Low | Low | S | P3 | Open |
| Region-page intros may be templated/thin | Content | `/trails/[region]`, `/discover/[region]/[category]` render mostly UI + lists | Medium | Medium | Medium | M | P2 | Needs review |
| Homepage H1 = "Tarnoo" (brand only) | On-page | `[locale]/page.tsx` H1 is the logo | "route planner" head term | Low | Low | S (risky) | P3 | Open |
| Activity × country programmatic pages absent | Programmatic | Trail data exists for 28 countries (DB) but no `hiking-routes-in-<country>` pages | High | High | High | L | P1 | Not built |
| Client-rendered discovery text | Technical | `DiscoverClient` is `"use client"`; verify intro/FAQ land in SSR HTML | Medium | Medium | Low | S | P2 | Verify |
| Competitor/"alternative" page | Content | "komoot alternative" intent uncovered | High | Medium | Medium | M | P2 | **Held** (needs verified competitor facts — see COMPETITOR_GAPS) |
| ~~No analytics = SEO is flying blind~~ | Data | Vercel Web Analytics + Speed Insights instrumented (`layout.tsx`), verified live | — | High (measurement) | — | S–M | P1 | **Done (code)** — enable in Vercel dashboard + set up GSC (see Measurement setup) |

## Measurement setup (2026-08-29)

**Instrumented in code (done):** Vercel **Web Analytics** (`<Analytics/>`) +
**Speed Insights** (`<SpeedInsights/>`) in `[locale]/layout.tsx` — cookieless,
no consent banner. Verified live (`window.va`/`window.si` initialized, pageview
queued). `.npmrc legacy-peer-deps=true` added (optional framework peers conflict
with vite 5).

**Requires manual (non-repo) steps — do these to actually get data:**
1. **Vercel dashboard** → enable **Web Analytics** and **Speed Insights** for the
   project (the `<...>` components only emit once the products are on).
2. **Google Search Console** (the SEO-critical one — search queries, impressions,
   clicks, positions, coverage): add `tarnoo.com` as a property, verify it, then
   **submit `https://tarnoo.com/sitemap.xml`**. Verification is already wired:
   the layout renders `verification.google` from `site_settings.google_site_verification`
   — set that column to the GSC token (admin) and the meta tag appears; no code
   change needed. (Bing Webmaster Tools is an easy optional add via the same path.)

Until GSC is connected, the SEO track has traffic/CWV (Vercel) but **not** search-
query data — treat ranking claims as unmeasured.

## Programmatic SEO opportunities

Think **activity → country → region → route/trail**, but **only where real data
backs the page** (the existing `n ≥ 8` gate is the model to reuse). Evidence:
28 countries have trail data; DE/ES/FR/IT/AT each 2.5k–4.5k trails; highlights
dense in 25+ countries.

Data-supported candidates (validate counts + apply a thin-content gate):
- `hiking-routes-in-<country>` — strong where hike ≥ ~400 (DE, NL, ES, AT, CZ, IT).
- `mtb-routes-in-<region>` — Alps/Dolomites/France (FR mtb 1774, IT 1155, AT 886).
- `cycling-routes-in-<country>` — DE/FR/PL/ES; **caveat:** NL/BE cycling under-counted (node network).
- `gravel-routes-in-<country>` — **only DE/PL/FR have enough data**; do not generate elsewhere.

**Reject:** thin AI-generated doorway pages, any `activity × country` page for a
country/activity below the data gate, and pages that merely re-list what
`/trails` filters already show without added value.

## Internal linking opportunities

- Landing cluster → sitewide footer nav (done). Extend: link **region pages** and **detail pages** to the matching activity landing page and vice-versa.
- Add contextual links from tour/trail detail pages to their **country/region** hub and to related routes (a "related routes" sort already exists via `sportFamily`).
- Ensure every indexable page is reachable within ~3 clicks from the home/nav (audit orphan risk on deep region pages).

## Technical SEO issues

- **No analytics/Search Console signal in repo** → cannot measure what ranks; highest-leverage "technical" gap.
- **Verify client pages SSR their new text** (`/discover` intro/FAQ) — client components can under-render for crawlers.
- Confirm **CDN cache** doesn't serve stale titles after deploys (observed lag; self-heals).
- Confirm **noindex vs sitemap** stays consistent as data grows (guarded by `sitemap-privacy.test.ts` — keep it green).

## Content / data opportunities

- **AI highlight descriptions** already exist (`scripts/describe-highlights.ts`, `daily-descriptions.sh`) — leverage for richer, unique highlight pages (raises the content-rich count → more indexable pages honestly).
- Turn **official long-distance routes** into first-class content where OSM has them.
- Fill **null-country highlights** (~17k) to unlock more region combos.

## Top 10 SEO opportunities (ranked)

1. ~~**Instrument analytics**~~ — ✅ done (Vercel Web Analytics + Speed Insights, verified live). Remaining: enable both in the Vercel dashboard + connect Google Search Console (see Measurement setup). (P1)
2. **`activity × country/region` programmatic pages, data-gated** — biggest scalable, *honest* upside (real trail data for 28 countries). (P1)
3. **Fix/validate node-network cycling** so cycling pages aren't hollow in NL/BE. (P1, cross-ref EUROPE)
4. **Region-page intros + internal links** (unique text, not templated). (P2)
5. **Verify `/discover` client-rendered SEO text lands in SSR.** (P2)
6. **Richer highlight pages via existing AI descriptions** → more content-rich indexable pages. (P2)
7. **"Komoot alternative" page** — once facts are verified. (P2)
8. **Per-page OG images** for landing + region pages. (P3)
9. **Homepage crawlable content / H1** — carefully, without hurting the app. (P3)
10. **Fill null-country highlights** to unlock region combos. (P3, cross-ref EUROPE)

*(Do not implement here — run `/seo` for one iteration at a time.)*
