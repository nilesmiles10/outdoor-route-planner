Continuously improve Tarnoo's **organic search visibility** through genuinely
useful content and technical SEO.

Read `docs/claude/SEO_GAPS.md`, `seo/SEO_BACKLOG.md`, and `seo/SEO_CHANGELOG.md`
first (and `CLAUDE.md` for stack). Then loop:

1. **Pick** the highest-impact open item from the backlog/gaps — a new page for a
   real, uncovered search intent, or an improvement to an existing page.
2. **Avoid cannibalization** — search existing routes/pages first; if one already
   targets the intent, improve it instead of adding a competing URL. Never build
   a page that competes with the homepage's generic "route planner" intent.
3. **Verify the feature in code** before writing any claim about it.
4. **Implement** using existing patterns (server component + `generateMetadata` +
   `pageTitle` + self-canonical + `SiteFooter`; shared `ActivityPlannerLanding`
   for use-case pages). Include: unique title/meta/OG, one H1, logical H2/H3, a
   direct answer up top, useful content, internal links + CTA, and only truthful
   JSON-LD (FAQPage / SoftwareApplication / BreadcrumbList). Add new pages to
   `sitemap.ts` and cross-link them.
5. **Validate** — `tsc` + `next build`; verify on production (cache-bust) that
   title/canonical/H1/schema/sitemap/links are correct.
6. **Update** `seo/SEO_BACKLOG.md` + `seo/SEO_CHANGELOG.md` + `docs/claude/SEO_GAPS.md`,
   then continue.

Rules: no thin, keyword-stuffed, duplicate, or fabricated-claim pages. No fake
ratings/reviews/authors/stats. One excellent page beats ten weak ones. Write for
humans, not for keyword density.
