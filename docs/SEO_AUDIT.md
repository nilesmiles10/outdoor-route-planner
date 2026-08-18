# Tarnoo — Technical SEO audit

Working doc for the SEO engineering loop. The **Backlog is the source of
truth**; it is not re-derived each iteration. Full re-audit on iteration 1
and every 10th iteration.

Stack as verified on 2026-08-18 (not from memory):
Next.js 14.2.35 App Router · `next-intl` v4 (`/[locale]`, nl + en) ·
Supabase Postgres with RLS as the visibility layer · Vercel (fra1) ·
no test framework present.

---

## Measured content inventory (2026-08-18, live Postgres)

| Entity | Count | Indexable today |
|---|---|---|
| `trails` (official OSM routes) | 30,265 | yes — segmented sitemap |
| `highlights` (OSM POI seed) | 500,875 | **no** — only content-rich (≥1 tip/photo) |
| `tours` public + planned (user routes) | 21 | yes |
| `tours` total | 28 | RLS-gated |
| `collections` public | 7 | yes, when non-empty |
| `pages` published & indexable | 0 | n/a |
| `profiles` | 1 (all public) | yes — **see P0-1** |
| region × category combos (`highlight_regions`, n ≥ 8) | ~1.2k rows source | gated at n ≥ 8 |

**Anti-doorway threshold in force:** region × category landing pages require
`n >= 8` highlights (`sitemap.ts`, `discover/[region]/[category]`). Highlight
detail pages require ≥1 tip or photo. Both predate this loop and are
consistent between sitemap and page-level `robots`. Keep this rule; do not
add a page type without measuring its populating count first and writing the
count into this table.

---

## Backlog

### P0 — crawl/index blockers and privacy leaks

**P0-1 · Private profiles are indexable and emit Person JSON-LD**
- *What*: `/[locale]/user/[id]` has no `robots` directive and unconditionally
  emits `Person` JSON-LD (name, `description` = bio, `homeLocation`, `url`)
  plus a metadata title/description built from the same fields — including
  when `profiles.privacy = 'private'`.
- *Why*: RLS policy `profiles_select_all` is `USING (true)`, verified against
  the live DB, so an anonymous crawler receives private profile rows. Private
  user content must never reach generated metadata or JSON-LD. Latent rather
  than active today (0 private profiles of 1 total), which makes it cheap to
  fix now and expensive to fix after the first private signup.
- *Files*: `src/app/[locale]/user/[id]/page.tsx`
- *Acceptance test*: for a profile with `privacy='private'`, the delivered
  HTML contains `noindex` and contains **no** `application/ld+json` Person
  block; a public profile is unchanged (indexable, JSON-LD present).

**P0-2 · No automated privacy regression test — BLOCKED, decision needed**
- *What*: there is no test asserting that private/unlisted content is absent
  from every sitemap, from listing queries, and from metadata/JSON-LD.
- *Why*: the loop brief requires this as a deliverable. Today the guarantee
  rests entirely on Supabase RLS plus per-page code review.
- *Blocker*: the repo has **no test framework at all** (`package.json` has no
  `test` script and no vitest/jest/playwright). Adding one is a new dev
  dependency and a CI decision — outside SEO scope.
- **Open question for Niels**: may I add `vitest` as a devDependency plus a
  `npm test` script, to host this privacy regression suite? It is dev-only
  (no runtime/bundle weight). Without it P0-2 cannot be closed.

### P1 — SEO architecture

**P1-1 · SEO logic is scattered across page components**
- *What*: canonical, title, OG, JSON-LD and breadcrumb construction are
  hand-rolled per route (`tour`, `trail`, `highlight`, `collection`,
  `discover`, `user`). No shared entity/SEO module.
- *Why*: each new page type can forget canonical, a robots gate or a
  visibility filter — which is exactly how P0-1 arose. A shared layer makes
  the correct thing the default.
- *Files*: new `src/lib/seo/*`, then migrate one route per iteration.
- *Acceptance test*: `grep -rn "alternates:" src/app` shows routes deriving
  canonical from the shared helper; rendered HTML for a migrated route is
  byte-identical to before on title/canonical/JSON-LD.

**P1-2 · `/[locale]/user/[id]` has no self-canonical**
- *What*: no `alternates.canonical`, so `?utm=`/`?fbclid=` variants are
  distinct URLs.
- *Files*: `src/app/[locale]/user/[id]/page.tsx`
- *Acceptance test*: `curl -s <user-url>?fbclid=x | grep canonical` shows the
  clean path.

**P1-3 · Verify hreflang actually ships**
- *What*: `[locale]/layout.tsx` deliberately omits `alternates.languages` and
  relies on next-intl emitting `Link: rel="alternate"` HTTP headers.
- *Why*: this is an assumption recorded in a comment, not evidence. If the
  header is absent in production the site has **no** hreflang at all across
  two locales.
- *Acceptance test*: `curl -sI https://tarnoo.com/nl/trails | grep -i '^link:'`
  shows en/nl/x-default pointing at the page-specific URLs.

### P2 — meaningful improvements

**P2-1 · `/[locale]/routes` and `/[locale]/feed` are personalized but indexable**
- *What*: both are logged-in surfaces with generic titles and no robots gate.
- *Acceptance test*: both return `noindex` in delivered HTML, or are proven to
  render meaningful public content when anonymous.

**P2-2 · Activity-first URL architecture not implemented**
- *What*: the brief proposes `/hiking/{country}/{region}/{city}`. Today the
  geographic surface is `/discover/{region}/{category}`.
- *Why*: potentially large win, but it is a URL-architecture migration with
  redirect obligations. Needs design in `SEO_PAGE_ARCHITECTURE.md` and a
  measured count per proposed page type before any build.

**P2-3 · Concurrent agent commits with `git add -A`**
- *What*: the UX agent stages the whole worktree, so in-flight SEO edits land
  in unrelated commits (observed 2026-08-18, commit `55af66a`).
- *Why*: it breaks per-change provenance and can commit a half-finished or
  stubbed file mid-verification. Not an SEO defect, but it directly threatens
  this loop's verification gate.
- *Mitigation on this side*: keep each iteration's edit window as short as
  possible and never leave a temporary test stub on disk across a build.
- *Acceptance test*: n/a — coordination item to raise with Niels.

### P3 — optimizations

- **P3-1** `sitemap.ts` `changeFrequency`/`priority` are hand-set constants;
  Google ignores both. Harmless, low value to remove.
- **P3-2** Image `loading`/`alt` sweep across route cards.
- **P3-3** LCP/CLS/INP field measurement — no data collected yet.

---

## In progress

_(empty — P0-1 completed this iteration)_

**Next up**: P1-3 (verify hreflang `Link` headers actually ship — cheap, pure
evidence, no file collision), then P1-2 (self-canonical on user profiles).
P0-2 is blocked on the vitest question above.

---

## Done

### 2026-08-18 — P0-1 private profiles no longer indexable or in JSON-LD

*Change*: `src/app/[locale]/user/[id]/page.tsx` — `generateMetadata` adds
`robots: { index: false, follow: false }` when `profiles.privacy === 'private'`;
the `Person` JSON-LD block is rendered only when privacy is not `private`.
No markup, className or styling touched.

*Rendered-HTML evidence* (production build, `npm run start`, curl of
`/nl/user/b60c3f2a-…`):

| Case | HTTP | `<meta name="robots">` | JSON-LD blocks |
|---|---|---|---|
| privacy = `private` (forced locally) | 200 | `content="noindex, nofollow"` | **0** |
| privacy = `public` (real row) | 200 | absent (indexable) | 1 × `"@type":"Person"` |

The private case was exercised by temporarily forcing `privacy: 'private'` in
`getProfile` on a local production build, capturing the HTML, then reverting
the stub and rebuilding (`npm run build` exit 0, no `TEMP-SEO-TEST` remains).
A production DB mutation was deliberately **not** used.

*Gates*: `next lint` clean · `npm run build` exit 0 · `tsc --noEmit` reports
only the pre-existing `scripts/describe-highlights.ts(271)` duplicate-function
error, confirmed identical with the change stashed · regression curl:
`/nl` 200, `/nl/trails` 200, `/nl/discover` 200, `/robots.txt` 200,
`/sitemap.xml` 200.

*Provenance note*: the code change was swept into commit `55af66a`
(`feat(planner): Ctrl+Y redo …`) by the concurrent UX agent running a
repo-wide `git add -A` while this iteration was mid-verification. The content
in `HEAD` is the correct, stub-free version (verified: working tree matches
`HEAD`, `isPrivate` present, no test stub). That commit was **not** rewritten.

---

## Deliberately not doing

- **Indexing the 500k OSM highlights.** Thin content; the existing ≥1 tip/photo
  gate is correct and stays.
- **Removing the `n >= 8` region×category gate.** It is the anti-doorway rule.
- **Cosmetic/CSS/component restructuring.** Owned by the concurrent UX agent.
- **Bulk generation of city/country pages** until counts justify each type.
