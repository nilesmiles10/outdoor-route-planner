# Tarnoo SEO Changelog

Newest first. Each entry: what shipped and why it should help search visibility.

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
