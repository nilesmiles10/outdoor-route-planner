# Tarnoo — landing-page templates and URL architecture

Kept in sync with what is **actually implemented**. Every template carries a
status: `implemented` / `approved-not-built` / `rejected`.

Locale prefix `/{nl|en}` applies to every route below (`next-intl`).
Canonical host: `tarnoo.com` (www and the Vercel alias 301 in `middleware.ts`).

---

## Implemented

| Template | URL | Status | Index gate | Notes |
|---|---|---|---|---|
| Home / planner | `/{locale}` | implemented | index | self-canonical |
| Trail index | `/{locale}/trails` | implemented | index | 30,265 trails |
| **Trail region landing** | `/{locale}/trails/{region}` | **implemented 2026-08-18** | index **iff n ≥ 8** | 443 regions, 96.0% of trails. Slug carries a country suffix where names collide (`limburg-nl`). Breadcrumb + ItemList JSON-LD; parent of the trail detail pages |
| Trail detail | `/{locale}/trail/{id}` | implemented | index | canonical, BreadcrumbList JSON-LD, OG image, related trails by region |
| Tour detail (user route) | `/{locale}/tour/{id}` | implemented | RLS-gated | anon sees only `visibility='public'`; non-public → hard 404 via `layout.tsx` above the Suspense boundary |
| Discover hub | `/{locale}/discover` | implemented | index | |
| Region × category | `/{locale}/discover/{region}/{category}` | implemented | index **iff n ≥ 8** | anti-doorway gate; region slug carries a country suffix where names collide (Limburg NL/BE, Jura CH/FR) |
| Highlight detail | `/{locale}/highlight/{id}` | implemented | index **iff ≥1 tip or photo** | 500,875 rows exist; only content-rich ones are indexed and sitemapped |
| Collection detail | `/{locale}/collection/{id}` | implemented | index iff ≥1 visible tour | empty collections `noindex` and excluded from sitemap |
| CMS page | `/{locale}/{slug}` | implemented | `pages.noindex` flag | 0 published indexable pages today |
| User profile | `/{locale}/user/{id}` | implemented | **noindex iff `privacy='private'`** (2026-08-18) | self-canonical added 2026-08-18; `Person` JSON-LD only when public |
| Embed widget | `/embed/{id}` | implemented | noindex | intentionally iframe-able; `X-Frame-Options` excluded for this path |
| My routes | `/{locale}/routes` | implemented | **noindex, follow** (2026-08-18) | auth-gated; anonymously renders a login form |
| Feed | `/{locale}/feed` | implemented | **noindex, follow** (2026-08-18) | auth-gated; anonymously renders the empty state |
| Admin | `/admin/**` | implemented | noindex, nofollow | disallowed in robots.txt |

### Sitemap architecture (implemented)
- `/sitemap.xml` — hubs, public planned tours, non-empty public collections,
  region×category combos, published CMS pages. Both locales.
- `/trails-sitemap/sitemap/{n}.xml` — segmented, 1000 URLs/segment.
- `/highlights-sitemap/sitemap/{n}.xml` — segmented, content-rich only.
- `robots.ts` enumerates every segment (Next emits no sitemap index). The
  segment count is read from the PostgREST `content-range` header with
  `cache: 'no-store'` — Next's Data Cache drops that header on a hit, which
  previously hid ~30 segments.

---

## Known gap: the internal link graph

Measured 2026-08-18 on production. Every template above is reachable in the
sitemap; almost none are reachable by **link**:

| Page | links out to tours | collections | trails | region pages |
|---|---|---|---|---|
| `/nl` | 0 | 0 | 0 | 0 |
| `/nl/discover` | 0 | 0 | 0 | 0 |
| `/nl/collections` | 0 | 0 | 0 | 0 |
| `/nl/trails` | 0 | 0 | 200 | 0 |
| `/nl/discover/{region}/{cat}` | 0 | 0 | 0 | 0 (49 highlights) |
| `/nl/trail/{id}` | 0 | 0 | 20 | 0 |

**Partly fixed 2026-08-18.** The trail half now has a real hierarchy:

`/{locale}/trails` → `/{locale}/trails/{region}` (443 pages) →
`/{locale}/trail/{id}` (30,265 pages), and back up via the breadcrumb. The
region×category pages link across to the matching trail-region page. Re-measured
after the change: a trail page now carries **0** `trails?country=` links and one
`/nl/trails/{region}` link; the region×category page likewise.

**Fixed 2026-08-18 (option A).** Both hubs now have a thin server `page.tsx`
that preloads the public rows and passes them to the existing client component
(`DiscoverClient` / `CollectionsClient`). Re-measured: `/nl/discover` carries
**21** tour links (was 0) and `/nl/collections` **5** collection links (was 0),
in both locales. No orphan set remains.

**Still client-only**: the region×category chips on `/discover` (P1-8) and the
payload weight of the SSR list (P1-9).

## Approved, not built

| Template | URL | Why | Precondition |
|---|---|---|---|
| Activity hub | `/{locale}/hiking`, `/{locale}/cycling` | strongest head-term surface | needs an activity→trail mapping the data supports; `trails.sport` exists |
| Activity × country | `/{locale}/hiking/{country}` | natural crawl tier above region | measure trails per country first; min 8 to match the existing gate |
| Activity × region | `/{locale}/hiking/{region}` | overlaps `discover/{region}/{category}` | **must not duplicate** the existing region page — decide consolidate vs redirect before building |
| Shared SEO entity layer | `src/lib/seo/*` | one source for canonical, title, breadcrumbs, JSON-LD, sitemap entry and visibility filtering | backlog P1-1. Partly seeded: `src/lib/seo/` now holds the privacy/visibility regression suite (31 assertions), but metadata construction is still per-route. |

---

## Rejected

| Template | Why rejected |
|---|---|
| Page per OSM highlight (all 500,875) | thin content / doorway risk. Only content-rich highlights qualify. |
| City-level landing pages | no city entity in the data model today; would be generated from a URL pattern rather than from real content. Revisit only with measured per-city counts. |
| Activity × region × difficulty facets | combinatorial thin pages; filter state belongs in query params, not indexable URLs. |
| Indexable filtered/query-param URLs on `/trails` | duplicate-content surface; self-canonical consolidates instead. |
