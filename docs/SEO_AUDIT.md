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

**P0-2 · Automated privacy regression test** — slice 1 done 2026-08-18
(sitemap assertions). Remaining slices below.

**P0-2d · Assert the tour metadata path emits nothing for a non-public tour**
- *What*: render `generateMetadata` from `tour/[id]/page.tsx` for a non-public
  id and assert no tour name, description or JSON-LD is produced.
- *Blocker*: `page.tsx` pulls in `maplibre-gl` through `TourView`; needs either
  a module alias stub for the map component in the test config, or extracting
  `generateMetadata` into a sibling module that does not import UI.
- *Acceptance test*: metadata for a non-public id contains no `tour.name`.

**P0-2d · Assert the tour metadata path emits nothing for a non-public tour**
- *What*: render `generateMetadata` from `tour/[id]/page.tsx` for a non-public
  id and assert no tour name, description or JSON-LD is produced.
- *Blocker*: `page.tsx` pulls in `maplibre-gl` through `TourView`; needs either
  a module alias stub for the map component in the test config, or extracting
  `generateMetadata` into a sibling module that does not import UI.
- *Acceptance test*: metadata for a non-public id contains no `tour.name`.

**P0-2b · Extend the privacy suite to listing/landing queries**
- *What*: assert private/unlisted content is absent from `/discover`,
  `/trails`, related-routes and "collections containing this route" queries.
- *Files*: `src/lib/seo/*.test.ts`
- *Acceptance test*: a non-public tour in the fixture never appears in any
  listing result; removing a `.eq("visibility","public")` turns the suite red.

### P1 — SEO architecture

**P1-5 · `/discover` and `/collections` ship zero content in the HTML**
- *What*: both hubs fetch their listings client-side from `useEffect`. Measured
  2026-08-18 against production:

  | URL | HTML bytes | tour links | trail links | collection links |
  |---|---|---|---|---|
  | `/nl/discover` | 42,341 | **0** | **0** | **0** |
  | `/nl/collections` | 39,762 | **0** | **0** | **0** |
  | `/nl/trails` | 631,131 | 0 | **200** | 0 |

- *Why this matters*: `/discover` carries `priority: 0.9, changeFrequency:
  daily` in the sitemap and is the site's main discovery hub, but a crawler
  receives an empty shell. The 21 public tours and 7 public collections have
  **no internal link path at all** — they are reachable only via the sitemap,
  i.e. textbook orphan pages. `/trails` proves the SSR pattern already works
  here (200 trail links in the delivered HTML), so this is a fixable
  inconsistency, not a platform limit.
- *Files*: `src/app/[locale]/discover/page.tsx`,
  `src/app/[locale]/collections/page.tsx` — both are large client components
  the UX agent is likely to touch. **Do not rewrite them.** The smallest
  correct fix is a server-rendered list rendered alongside the interactive
  client hub, or a server component wrapper that passes initial data as props.
- *Acceptance test*: `curl -s https://tarnoo.com/nl/discover | grep -c '/nl/tour/'`
  returns > 0, and the same for `/nl/collections` with `/nl/collection/`.

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

**P1-4 · Concurrent agent commits with `git add -A` — RAISED TO P1, NEAR-MISS**
- *What*: the UX agent stages the whole worktree. Observed **twice** on
  2026-08-18: commit `55af66a` swept the private-profile fix, commit `4dd876c`
  swept the vitest scaffold and privacy test.
- *Why this is now P1 and not a tidiness issue*: verification techniques
  require deliberately breaking code for a few seconds — the mutation check
  for P0-2 ran with `.eq("visibility","public")` **removed** from
  `src/app/sitemap.ts`. A repo-wide `git add -A` landing in that window would
  have committed a live privacy regression (every private, followers-only and
  close-friends route into the public sitemap) under a planner commit message,
  with a green-looking history. This time HEAD was verified intact:
  `git show HEAD:src/app/sitemap.ts` still contains both `visibility` filters
  and the suite passes 9/9 against committed code.
- *Mitigations on this side (in force from now on)*: run mutation checks on a
  scratch copy rather than the tracked file wherever possible, and never leave
  a deliberately-broken tracked file on disk across an await.
- *Needs Niels*: tell the UX agent to stage explicit paths. This cannot be
  fixed from inside this loop.
- *Acceptance test*: n/a — coordination item.

### P3 — optimizations

- **P3-1** `sitemap.ts` `changeFrequency`/`priority` are hand-set constants;
  Google ignores both. Harmless, low value to remove.
- **P3-2** Image `loading`/`alt` sweep across route cards.
- **P3-3** LCP/CLS/INP field measurement — no data collected yet.

---

## In progress

_(empty — P0-1 completed this iteration)_

**Next up**: P1-5 — `/discover` and `/collections` deliver zero crawlable
links, orphaning all 21 public tours and 7 public collections. Highest-value
remaining item, but it touches two large client components the UX agent owns,
so it needs a careful non-invasive approach (server wrapper passing initial
data, not a rewrite). Then P0-2d, then P1-2.

---

## Done

### 2026-08-18 — P0-2 slice 3 (P0-2b): listing queries can no longer forget the filter

*First, the audit*: enumerated every `.from("tours")` / `.from("collections")`
read in `src/` (33 call sites). Every publicly indexable listing already
filters correctly — `/discover` (both queries), `/collections`, the highlight
page, the tour page's related-routes query and `sitemap.ts`. No live leak was
found. The gap was that nothing *enforced* it.

*Change*: `src/lib/seo/visibility-guard.test.ts` — a source-scanning invariant.
Every query is classified as either `PUBLIC_LISTING` (must filter) or
`NOT_PUBLIC_LISTING` (with a written reason each). An unclassified query fails
the suite. Plus one comment-only annotation in `tour/[id]/page.tsx` marking the
derived `.in("id", …)` query as `seo-visibility-ok` with its justification.

*Why source-scanning and not runtime*: the risk is a **future** page type
forgetting the filter. A runtime test cannot fail for a page it does not know
about; a source scan can.

*Evidence — two mutation checks*:

| Mutation | Result |
|---|---|
| dropped **one of two** `/discover` visibility filters | **red** — `keten #1` |
| added a new unclassified page querying `tours` | **red** — `app/[locale]/zzztest/page.tsx` |
| unmutated | 27 passed / 27 |

The first mutation is worth recording: the guard's **first version was per-file
and stayed green** on it, because `/discover` has two queries and the file
still matched once. That false pass is exactly the bug the guard exists to
catch, so it was rewritten to check every query chain individually. A guard
that cannot fail is worse than no guard, because it reads as coverage.

*Gates*: `npm test` 27/27 (3 suites) · `next lint` clean · `tsc --noEmit`
exit 0 · `npm run build` exit 0 · rendered HTML for the touched tour route:
HTTP 200, `<title>Utrecht naar Amersfoort | 21.5 km Fietsen</title>`, canonical
present, JSON-LD intact (`Trip`, `BreadcrumbList`, 2 × `Place`, `Person`).

### 2026-08-18 — P0-2 slice 2 (P0-2c): direct access to non-public routes

*RLS verified against the live DB first* (the layer the app test assumes):
`tours_select` and `collections_select` both use
`can_view_content(owner, visibility)`. Reading its definition: an anonymous
visitor (`auth.uid()` NULL) matches only the `vis = 'public'` branch, and only
when the owner is not suspended **and** `profiles.privacy = 'public'`. The
`followers` and `close_friends` branches each require an `auth.uid()` match,
so they are unreachable anonymously. Side effect worth knowing: if an owner
flips their profile to private, their previously-public tours become 404 for
crawlers — correct behaviour, not a defect.

*Change*: `src/lib/seo/tour-access.test.ts` — 9 assertions; `vitest.config.ts`
gained `esbuild: { jsx: "automatic" }` (the layout uses the automatic runtime,
no `import React`).

*Evidence — mutation check*: removing `if (!tour) notFound();` from
`src/app/[locale]/tour/[id]/layout.tsx` turned the suite **red on 3 tests**
(private / followers / close_friends), then restored (`git diff HEAD` empty).

| Run | Result |
|---|---|
| unmutated | 18 passed / 18 (both suites) |
| `notFound()` guard removed | **3 failed**, 15 passed |

This specifically locks in the *hard* 404. `loading.tsx` makes the tour page a
Suspense boundary, so a `notFound()` inside `page.tsx` would land after a 200
shell — a soft-404 that Google indexes as a valid page. The guard must stay in
the layout, above the boundary; the test now enforces that.

*Known limitation, honestly stated*: the metadata/JSON-LD half of P0-2c is
asserted at the data layer (`getTour` returns null), not by rendering
`generateMetadata`. `page.tsx` transitively imports `TourView` → `maplibre-gl`,
which will not load in a node test environment. Both the metadata and the
render path are guarded by the same `getTour` null, which is covered. Filed as
P0-2d below rather than pretended to be covered.

*Gates*: `npm test` 18/18 · `next lint` clean · `tsc --noEmit` exit 0 ·
`npm run build` exit 0 · `git status` shows only `vitest.config.ts` and the
new test file.

### 2026-08-18 — P1-3 hreflang verified shipping (no code change needed)

The assumption recorded in `[locale]/layout.tsx` — that omitting
`alternates.languages` is safe because next-intl emits hreflang via the HTTP
`Link` header — is **correct**, now confirmed against production rather than
against a comment.

`curl -sI https://tarnoo.com/nl/trails`:
```
link: <https://tarnoo.com/en/trails>; rel="alternate"; hreflang="en",
      <https://tarnoo.com/nl/trails>; rel="alternate"; hreflang="nl",
      <https://tarnoo.com/trails>; rel="alternate"; hreflang="x-default"
```
Page-specific (not pointing at the homepage), absolute, on the canonical host,
and present on deep dynamic routes too — verified on
`/nl/trail/00015b65-…` (HTTP 200), which is the 30,265-page bulk of the site.
`x-default` targets the locale-negotiating unprefixed URL (`/trails` → 307),
which is the intended meaning of x-default.

Same request also confirms the trail template is fully server-rendered:
`<title>NaTourismus Waldroute | 26.2 km gravelroute | Tarnoo</title>`,
`<link rel="canonical" href="https://tarnoo.com/nl/trail/00015b65-…"/>`,
plus `BreadcrumbList` (3 × `ListItem`) and `Trip` JSON-LD — all in the
delivered HTML, none client-injected.

*Also checked and found healthy*: `x-vercel-cache` on a trail URL is `MISS`
only on a cold first hit, then `HIT` with a rising `age` on repeat requests.
The `localeCookie: false` workaround in `src/i18n/routing.ts` is doing its job;
no crawl-budget problem here. Not filed as an issue.

### 2026-08-18 — P0-2 slice 1: sitemap privacy regression test

*Change*: added `vitest` (devDependency, approved by Niels) + `npm test`,
`vitest.config.ts`, and `src/lib/seo/sitemap-privacy.test.ts` — 9 assertions
running the **real** `src/app/sitemap.ts` against a fake Supabase client that
applies only the `.eq()` filters the production code actually sends.

*Why a fake client and not a pure helper test*: a unit test on an extracted
predicate stays green while `sitemap.ts` forgets to call it. The risk being
covered is exactly that omission, so the test must execute the real sitemap.

*Evidence — mutation check (the part that makes the test worth having)*:
removing `.eq("visibility", "public")` from the tours query turned the suite
**red on 4 tests** (private / followers / close_friends / no-id-leaks), then
the file was restored (`git diff` on `src/app/sitemap.ts` empty).

| Run | Result |
|---|---|
| unmutated | 9 passed / 9 |
| `.eq("visibility","public")` removed | **4 failed**, 5 passed |

*Coverage*: excludes `private`, `followers`, `close_friends` tours; excludes
non-public collections; excludes public-but-empty collections (they are
`noindex`); confirms both locales for public content. Trails and highlights
sitemaps are deliberately out of scope — official OSM data, no visibility
column, no user content.

*Gates*: `npm test` 9/9 · `next lint` clean · `npm run build` exit 0 ·
`tsc --noEmit` exit 0 · `git status` shows only `package.json`,
`package-lock.json`, `vitest.config.ts`, `src/lib/seo/`. No route output
changed this iteration (`git diff HEAD -- src/app/sitemap.ts` empty), so
rendered-HTML evidence is not applicable here.

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
