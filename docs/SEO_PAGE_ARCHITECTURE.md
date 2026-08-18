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
| Trail detail | `/{locale}/trail/{id}` | implemented | index | canonical, BreadcrumbList JSON-LD, OG image, related trails by region |
| Tour detail (user route) | `/{locale}/tour/{id}` | implemented | RLS-gated | anon sees only `visibility='public'`; non-public → hard 404 via `layout.tsx` above the Suspense boundary |
| Discover hub | `/{locale}/discover` | implemented | index | |
| Region × category | `/{locale}/discover/{region}/{category}` | implemented | index **iff n ≥ 8** | anti-doorway gate; region slug carries a country suffix where names collide (Limburg NL/BE, Jura CH/FR) |
| Highlight detail | `/{locale}/highlight/{id}` | implemented | index **iff ≥1 tip or photo** | 500,875 rows exist; only content-rich ones are indexed and sitemapped |
| Collection detail | `/{locale}/collection/{id}` | implemented | index iff ≥1 visible tour | empty collections `noindex` and excluded from sitemap |
| CMS page | `/{locale}/{slug}` | implemented | `pages.noindex` flag | 0 published indexable pages today |
| User profile | `/{locale}/user/{id}` | implemented | **noindex iff `privacy='private'`** (2026-08-18) | no self-canonical yet — backlog P1-2 |
| Embed widget | `/embed/{id}` | implemented | noindex | intentionally iframe-able; `X-Frame-Options` excluded for this path |
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

## Approved, not built

| Template | URL | Why | Precondition |
|---|---|---|---|
| Activity hub | `/{locale}/hiking`, `/{locale}/cycling` | strongest head-term surface | needs an activity→trail mapping the data supports; `trails.sport` exists |
| Activity × country | `/{locale}/hiking/{country}` | natural crawl tier above region | measure trails per country first; min 8 to match the existing gate |
| Activity × region | `/{locale}/hiking/{region}` | overlaps `discover/{region}/{category}` | **must not duplicate** the existing region page — decide consolidate vs redirect before building |
| Shared SEO entity layer | `src/lib/seo/*` | one source for canonical, title, breadcrumbs, JSON-LD, sitemap entry and visibility filtering | backlog P1-1 |

---

## Rejected

| Template | Why rejected |
|---|---|
| Page per OSM highlight (all 500,875) | thin content / doorway risk. Only content-rich highlights qualify. |
| City-level landing pages | no city entity in the data model today; would be generated from a URL pattern rather than from real content. Revisit only with measured per-city counts. |
| Activity × region × difficulty facets | combinatorial thin pages; filter state belongs in query params, not indexable URLs. |
| Indexable filtered/query-param URLs on `/trails` | duplicate-content surface; self-canonical consolidates instead. |
