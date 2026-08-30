Run **one iteration** of the SEO loop for Tarnoo.

One iteration = one meaningful improvement. Quality over count.

1. **Inspect `docs/claude/SEO_GAPS.md`** (and `seo/SEO_BACKLOG.md`, `seo/SEO_CHANGELOG.md`, `CLAUDE.md`).
2. **Identify the highest-value SEO opportunity** — a real, uncovered search intent or a fix to an existing page. Avoid cannibalising the homepage's generic "route planner" intent.
3. **Verify the current implementation** (grep/read the relevant routes, metadata, sitemap, structured data). Don't assume.
4. **Confirm real search + user value** — would a human searching this be genuinely helped?
5. **Ensure Tarnoo has the underlying data** to make the page/feature useful (apply the existing thin-content gate, e.g. `n ≥ 8`). If the data isn't there, don't build the page.
6. **Prefer reusable SEO infrastructure** (shared components, the sitemap/metadata patterns) over one-off pages.
7. **Avoid thin programmatic content** — no doorway pages, no page that just re-lists what a filter already shows.
8. **Implement one meaningful improvement.**
9. **Validate** metadata / indexability / canonical / hreflang / sitemap inclusion / internal linking as appropriate.
10. **Test** — `tsc` + `next build`; verify on production (cache-bust) that title/canonical/H1/schema/links are correct.
11. **Update `docs/claude/SEO_GAPS.md`** (+ `seo/SEO_BACKLOG.md` / `SEO_CHANGELOG.md`).
12. **Update `docs/claude/ROADMAP.md`** where appropriate.

**Never fabricate** routes, statistics, ratings, geographic claims, or trail
descriptions. Every claim on every page must trace to real product data or
behaviour. No fake reviews/authors/counts.
