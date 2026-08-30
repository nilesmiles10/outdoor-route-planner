# Tarnoo SEO Changelog

Newest first. Each entry: what shipped and why it should help search visibility.

## 2026-08-29 — Iteration 8: homepage footer + intro/FAQ on /trails & /discover

**Improvements to existing pages**
- **Homepage** now renders `SiteFooter` below the fullscreen planner (below the
  fold, no UX impact). The site's highest-authority page now links to all 7
  landing pages — closing the last internal-linking gap.
- **`/trails`** gained a factual intro paragraph + a 4-question FAQ with
  `FAQPage` structured data. Turns a UI-heavy page into one with unique,
  crawlable, keyword-relevant text.
- **`/discover`** gained the same treatment (intro + FAQ + `FAQPage`), with
  categories described generically ("viewpoints, natural features and points of
  interest") — not invented specifics.

**Why**
- These are high-value existing pages that were thin on crawlable text; intros +
  FAQs add topical relevance and structured data, and the homepage footer spreads
  link equity to the cluster from the strongest page. No fabricated claims.

**Technical validation**
- `tsc` clean; `next build` green.


## 2026-08-29 — Iteration 7: sitewide footer links (link-equity distribution)

**Technical SEO / internal linking**
- Added a "Plan a route" navigation group to `SiteFooter` (present on every
  content page — trails, discover, tour/trail/collection detail pages, and the
  landing pages) linking all 7 use-case pages with descriptive anchor text.

**Why**
- Audit finding: the 7 new landing pages were reachable only via sitemap + their
  own reciprocal cross-links — not from any sitewide nav or footer. They were
  effectively siloed. A footer nav gives them an internal link from many
  higher-authority pages, spreading link equity and improving crawl/discovery —
  usually the highest-leverage on-site SEO move after the pages themselves exist.

**Technical validation**
- `tsc` clean; `next build` green.


## 2026-08-29 — Iteration 6: Loop / round-trip route planner

**Pages created**
- `/[locale]/loop-route-planner` (nl: "Rondje maken") — both locales, SSG.

**Verified feature first**
- Confirmed in code that "Rondje" is a genuine target-distance loop *generator*
  (GEN-107, `lib/roundtrip` `loopVias`: set a start + distance → a loop of about
  that length back to start; "Ander rondje" produces variations). Only then
  wrote the copy — no claim beyond what the feature does.

**Content**
- Targets the distinct "circular walk / loop route generator / rondje van X km"
  intent: set a distance, get a loop; generate variations; any activity;
  elevation + surface; adjust + GPX export.

**Internal links**
- Links out to running, hiking, cycling, GPX; inbound from running + hiking.
  Added to `sitemap.ts` (both locales).

**Technical validation**
- `tsc` clean; `next build` green; both locale URLs pre-rendered (SSG).

**Session total: 7 SEO landing pages × 2 locales = 14 URLs**, one shared
component, densely cross-linked, every claim product-true. Next real opportunity
(Komoot comparison) remains held pending verifiable competitor facts.


## 2026-08-29 — Iteration 5: Multi-day route planner

**Pages created**
- `/[locale]/multi-day-route-planner` (nl: "Meerdaagse route plannen") — both
  locales, SSG.

**Content**
- Built on the real stage-split feature (GEN-121: per-day distance/climbing +
  a GPX per stage). Covers hut-to-hut hikes and bikepacking. No fabricated
  claims — per-stage GPX and per-day stats are actual product behaviour.

**Internal links**
- Links out to hiking, cycling and GPX; inbound links added from the hiking and
  cycling pages (so it's not an orphan). Added to `sitemap.ts` (both locales).

**Technical validation**
- `tsc` clean; `next build` green; both locale URLs pre-rendered (SSG).

**Status of the backlog after this iteration**
- High-value, low-risk cluster is now built: 6 pages (hike/cycle/MTB/run/GPX/
  multi-day) × 2 locales = 12 URLs, densely cross-linked.
- **Held:** "Komoot alternative" (P2) — needs verifiable, dated competitor facts
  we can't source from the repo; building it now would risk stale/fabricated
  claims, against the core principle. Revisit only with a carefully-scoped,
  checkable comparison.
- **Lower value / defer:** standalone how-to guide (overlaps the per-page
  "how to…" step sections already shipped); elevation-profile feature page
  (better as a section than a thin page).


## 2026-08-29 — Iteration 4: GPX page (create/export/import)

**Pages created**
- `/[locale]/gpx` (en: "GPX route planner — create & export GPX files", nl:
  "GPX maken") — both locales, SSG.

**Refactor**
- Made `ActivityPlannerLanding`'s trails section + secondary CTA optional, and
  the planner deep-link work with an empty `sport` — so it also serves
  activity-agnostic tool pages, not just activity pages.

**Content**
- GPX-specific and factual: one-click GPX export, turn-by-turn course, importing
  an existing GPX, works for every activity, "what is a GPX file" explainer.
  Deliberately avoids naming specific third-party apps as guaranteed-compatible
  ("GPS devices, sports watches and phone apps"). No fabricated claims.

**Internal links**
- GPX links to all four activity pages ("Plan by activity"), and all four now
  link back to GPX ("Make a GPX file" / "GPX maken") — full reciprocal linking.
- Added `/[locale]/gpx` to `sitemap.ts` (both locales).

**Technical validation**
- `tsc` clean; `next build` green; both locale URLs pre-rendered (SSG).

**Expected impact**
- Captures high-intent "make/create a GPX / GPX route planner" demand (Garmin
  and watch users) with a distinct, useful page, tightly woven into the activity
  cluster.


## 2026-08-29 — Iteration 3: MTB + running planners (activity cluster complete)

**Pages created**
- `/[locale]/mtb-route-planner` (nl: "MTB-route plannen") — off-road routing,
  surface, climbs/descents. No invented trail-difficulty grading.
- `/[locale]/running-route-planner` (nl: "Hardlooproute maken") — loop-from-your-
  door (Round trip), trail-vs-road surface, running-watch GPX (Garmin/Coros/
  Suunto/Apple Watch). `trailsSport=hike` since `/trails` has no run filter.

**Internal links**
- The four activity pages (hiking, cycling, MTB, running) now cross-link each
  other four-ways via the "Other route planners" block — a tight topic cluster.
- MTB + running added to `sitemap.ts` (both locales).

**Technical validation**
- `tsc` clean; `next build` green; all eight locale URLs pre-rendered (SSG);
  each page ~734 B on top of the shared component.

**Expected impact**
- Completes the activity-planner cluster (hike/cycle/MTB/run) covering the four
  main outdoor search intents with distinct, factual pages and dense internal
  linking that concentrates topical authority around "route planner" for Tarnoo.


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
