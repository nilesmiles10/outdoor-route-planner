# Tarnoo SEO Changelog

Newest first. Each entry: what shipped and why it should help search visibility.

## 2026-08-29 — Iteration 2: Cycling route planner + shared component

**Pages created**
- `/[locale]/cycling-route-planner` (nl: "Fietsroute plannen", en: "Cycling
  route planner") — both locales, SSG.

**Refactor**
- Extracted `src/components/seo/ActivityPlannerLanding.tsx` — one shared layout +
  JSON-LD (Breadcrumb/FAQ/SoftwareApplication) for all activity landing pages.
  Hiking page migrated to it; per-page bundle dropped ~9.4 kB → 723 B. New
  activity pages (MTB, running) are now just a copy object + a few props.

**Content**
- Cycling-specific and factual: the four real cycling modes (touring, gravel,
  road/racefiets, e-bike), road-vs-gravel surface, climbs, GPX for
  Garmin/Wahoo, multi-day/bikepacking. MTB deliberately deferred to its own page
  (distinct terrain/intent). No fabricated claims.

**Internal links**
- Reciprocal cross-links between hiking ↔ cycling ("Other route planners").
- Added `/[locale]/cycling-route-planner` to `sitemap.ts` (both locales).

**Technical validation**
- `tsc` clean; `next build` green; all four locale URLs pre-rendered (SSG).

**Expected impact**
- Captures cycling-planner and sub-mode (gravel/road/e-bike) intent distinct
  from the homepage, extends the activity cluster, and cross-links consolidate
  topical relevance.


## 2026-08-29 — Iteration 1: Hiking route planner landing page

**Pages created**
- `/[locale]/hiking-route-planner` (nl: "Wandelroute maken", en: "Hiking route
  planner") — dedicated React route, both locales, statically generated.

**Why**
- Audit found strong *programmatic* coverage (trails, discover, tours) but
  almost no *editorial / use-case* content. The homepage owns the generic
  "route planner / routeplanner" intent; a hiking-specific page captures the
  large, distinct "wandelroute maken / plan a hiking route" demand without
  cannibalising it, and seeds an activity-page cluster (cycling/MTB/running to
  follow).

**On-page SEO**
- Unique title via `pageTitle()`, meta description, self-canonical
  `/[locale]/hiking-route-planner`, Open Graph tags.
- One H1, logical H2/H3 structure, a direct answer in the lede.
- JSON-LD: `BreadcrumbList`, `FAQPage` (6 real Q&A), `SoftwareApplication`
  (free web app — price 0, **no invented ratings**).
- Two deep-link CTAs: planner preselected to hiking (`/[locale]?sport=hike`)
  and waymarked trails (`/[locale]/trails?sport=hike`).

**Content**
- Six feature sections (elevation/climbs, surface, 30k trails, multi-day, GPX,
  free/no-account), a five-step how-to, an FAQ, and a closing CTA. Every claim
  is traceable to a real product feature — nothing fabricated.

**Internal links**
- Added `/[locale]/hiking-route-planner` to `sitemap.ts` (both locales).
- Added a contextual link from `/[locale]/trails` (topically related official
  trails) → the hiking planner, with descriptive anchor text.

**Technical validation**
- `tsc --noEmit` clean; `next build` green; both locale URLs pre-rendered (SSG);
  no broken links introduced.

**Expected impact**
- Captures activity-specific hiking-planner queries the site did not target,
  with genuinely useful content + rich results eligibility (FAQ), funnelling
  searchers straight into the planner (hiking preselected) or the trail index.
