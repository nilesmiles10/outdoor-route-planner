# SEO Gaps — tracker

Summary view of the SEO track. The detailed backlog + changelog live in
`seo/SEO_BACKLOG.md` and `seo/SEO_CHANGELOG.md`; this file is the short "what's
left" list. Run with `/seo`.

Core rule: every page satisfies a real search intent and is genuinely useful.
**No thin, keyword-stuffed, duplicate, or fabricated-claim pages.**

## Done

- **Use-case landing cluster** (nl+en, SSG, shared `ActivityPlannerLanding`):
  `hiking-route-planner`, `cycling-route-planner`, `mtb-route-planner`,
  `running-route-planner`, `gpx`, `multi-day-route-planner`, `loop-route-planner`.
  Each: unique title/meta/canonical/OG, one H1, FAQ + SoftwareApplication +
  Breadcrumb JSON-LD, deep-link CTAs, dense reciprocal internal links.
- **Sitewide footer nav** to all 7 pages (every content page + homepage).
- **Intro + FAQ (FAQPage)** on `/trails` and `/discover`.

## Open gaps

| Gap | Priority | Notes |
|---|---|---|
| Per-page OG images for landing pages | Low | Currently use the generic site OG. Social CTR; minor ranking effect. Detail pages already have custom OG. |
| Region-page intros (`/trails/[region]`, `/discover/[region]/[category]`) | Med | Ensure each reads as unique, not templated-thin. Easy to make *worse* with filler — needs care. |
| Homepage H1 = "Tarnoo" (brand only) | Low | Weak for core "route planner" term, but it's the app header — risky to change. |
| "Komoot alternative" comparison page | Held | High intent, but needs verifiable, dated competitor facts (see `COMPETITOR_GAPS.md`). Do NOT ship with stale/invented claims. |

## Not gaps (verified good)

Detail-page schema (Trip/Place/GeoCoordinates/Breadcrumb), hreflang (en/nl Link
headers), canonicals, segmented sitemaps (trails + highlights), thin-content
noindex gating.
