# Tarnoo SEO Backlog

Living inventory of search opportunities and technical SEO work. Maintained by
the `/goal` SEO loop. One excellent page beats ten thin ones — every entry must
map to a real search intent Tarnoo can genuinely satisfy, with no fabricated
claims.

## Product facts (verified from the repo — do not exceed these)

- **What it is:** free, no-account web route planner for the outdoors, all of Europe.
- **Activities:** hiking (hike), running (run), cycling/touring, gravel, MTB, road/racefiets, e‑bike.
- **Per route:** distance, time estimate, **elevation profile** (ascent/descent), **categorised climbs**, **surface breakdown** (paved/unpaved/unknown), difficulty rating, access/private-land warnings, start‑location weather.
- **Data:** OpenStreetMap; **30,000+ official/waymarked trails** imported (region + activity filters at `/trails`).
- **Tools:** GPX import + export, turn‑by‑turn course export, waypoints, round‑trip ("Rondje"), reverse, **multi‑day stage split** ("In dagen opdelen").
- **Discovery:** `/discover` (region × category highlights), `/trails` (official trails), `/collections`, `/tour/[id]`, highlights.
- **Account (optional):** save routes, collections, tours, follows. Planning itself needs no account.
- Multilingual **nl + en** (`[locale]` prefix, shared segment slugs, no localized pathnames).

## Existing indexable surface (audit 2026-08-29)

- Home `/[locale]` — the planner. Targets generic "route planner / routeplanner". Self‑canonical. WebSite JSON‑LD.
- `/[locale]/trails` (+ `/trails/[region]`) — official-trail index, sport/region/distance filters, ItemList JSON‑LD. In sitemap (regions paged).
- `/[locale]/discover` (+ `/discover/[region]/[category]`) — highlights by region×category, ≥8 thin-gate. In sitemap.
- `/[locale]/collections`, `/collection/[id]` — curated route sets.
- `/[locale]/tour/[id]`, `/trail/[id]`, `/highlight/[id]` — detail pages, per-entity OG images. Thin OSM highlights are noindex; content-rich ones in a segmented highlights-sitemap.
- `/[locale]/[slug]` — DB-backed markdown CMS pages (privacy/terms/about-style). Minimal layout, **no JSON‑LD**, in sitemap.
- Infra: `sitemap.ts` (paged, quota-safe), segmented `trails-sitemap` + `highlights-sitemap`, `robots.ts` enumerating segments, per-page canonicals, hreflang via next-intl Link header, OG images.

## Gap analysis

Strong **programmatic** coverage (trails, discover, tours). **Near-zero editorial /
informational / use-case content** — the how‑to, activity-specific, and
comparison intents that pull top-of-funnel search demand and funnel it to the
planner. That is where the opportunity is.

## Opportunities

Scores 1–5 (relevance / intent / conversion / usefulness / uniqueness / linking), P = priority.

| Opportunity | Search intent | URL | Type | Priority | Status | Notes |
|---|---|---|---|---|---|---|
| Hiking route planner | "wandelroute maken", "plan hiking route", "hiking route planner" | `/[locale]/hiking-route-planner` | Use-case | **P1** | DONE | Biggest outdoor category + Tarnoo's core activity. Distinct from generic homepage. Cluster hub for activity pages. |
| Cycling route planner | "fietsroute plannen", "bike route planner" | `/[locale]/cycling-route-planner` | Use-case | P1 | DONE | Covers touring+gravel+road+ebike (MTB separate). Uses shared `ActivityPlannerLanding`. Reciprocal links with hiking. |
| MTB route planner | "mtb route plannen", "mountain bike route planner" | `/[locale]/mtb-route-planner` | Use-case | P2 | DONE | Off-road routing + surface + climbs/descents. No fabricated trail grading. |
| Running route planner | "hardlooproute maken", "running route planner" | `/[locale]/running-route-planner` | Use-case | P2 | DONE | Loop-from-door (Round trip) + trail-vs-road + watch GPX. trailsSport=hike (no run filter). |
| GPX route planner / make a GPX | "gpx maken", "create gpx file", "gpx route planner" | `/[locale]/gpx` | Feature | P1 | DONE | Import+export+turn-by-turn all real. Activity-agnostic (shared component with trails section made optional). Cross-linked with all 4 activity pages. |
| How to plan a hiking route | "how to plan a hiking route", "hoe plan je een wandelroute" | (section in hiking page + own guide later) | How-to | P2 | IDEA | Informational top-of-funnel; can start as a section, split out if it earns it. |
| Multi-day / hut-to-hut route planner | "meerdaagse wandeltocht plannen", "multi-day route planner" | `/[locale]/multi-day-route-planner` | Use-case | P3 | DONE | Built on the real stage-split (per-day stats + per-stage GPX, GEN-121). Inbound from hiking + cycling. |
| Elevation profile for a route | "elevation profile route", "hoogteprofiel route" | (feature section) | Feature | P3 | IDEA | Real feature; likely a section rather than a page. |
| Free route planner (no account) | "gratis routeplanner", "free route planner no sign up" | — | Product | P3 | SKIPPED-for-now | Overlaps homepage intent → cannibalization risk. Fold the "free/no account" angle into activity pages instead. |
| Komoot alternative | "komoot alternative", "komoot alternatief gratis" | `/[locale]/komoot-alternative` | Comparison | P2 | IDEA | High intent BUT requires competitor facts that go stale — only build with carefully-scoped, verifiable, dated claims. Hold until the factual scope is nailed. |

## Rules honoured

- No page competing head-on with the homepage's generic intent (cannibalization).
- Every claim traceable to the product-facts list above; no invented features/stats/reviews.
- Schema only where it truthfully describes the page (SoftwareApplication, FAQPage, BreadcrumbList).
- Reuse existing components/patterns (server component + `generateMetadata` + `pageTitle` + canonical + `SiteFooter` + ItemList/JSON-LD, next-intl).
