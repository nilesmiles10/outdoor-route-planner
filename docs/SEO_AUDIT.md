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

### P1 — SEO architecture

### P2 — meaningful improvements

**P2-5 · The full i18n catalogue ships on every page (20,416 bytes)**
- *What*: measured in the delivered HTML of `/nl/discover` — the entire
  translation catalogue is serialised into the RSC payload on **every** page,
  including namespaces that page never uses (`planner`, `tourPage`,
  `resetPassword`, `trailPage`, …). At 20.4 kB it is now the single largest
  item in that page's payload, ahead of `thumb_coords` (9,748 B across 24
  routes) and far ahead of `waypoints` (1,713 B after the P1-10 trim).
- *Why it is not a quick fix*: next-intl can send a subset of messages to the
  client, but that means auditing which namespaces each client component
  actually calls and passing only those — it touches the locale layout and
  every client component. Worth doing, but as its own piece of work.
- *Files*: `src/app/[locale]/layout.tsx` (the `NextIntlClientProvider`), plus a
  namespace audit per client component.
- *Acceptance test*: `/nl/discover` HTML drops by roughly the size of the unused
  namespaces, with every page still rendering its own copy correctly in both
  locales.

### P2 — meaningful improvements

**P2-4b · `/nl/trails` is STILL not CDN-cached — the shipped fix does not work**
- *What*: after deploying, production returns
  `cache-control: private, no-cache, no-store, max-age=0, must-revalidate` and
  `x-vercel-cache: MISS` on three consecutive hits. The `Cache-Control` header
  configured in `next.config.mjs` is **overridden**.
- *Why my local verification was misleading*: `next start` applied the config
  header, so the local check passed. On Vercel, Next's dynamic-route handling
  sets its own no-store `Cache-Control` afterwards. A route that reads
  `searchParams` is always dynamically rendered, and Next marks those uncacheable
  by default. This is precisely the claim flagged as "not verifiable locally" —
  and it turned out false.
- *Not a regression*: the page still returns 200 and behaves exactly as before;
  the viewer-independence half of P2-4 (the `supabasePublic()` switch and the
  `/admin/trails` screen) stands on its own and was the actual safety fix.
  Only the caching goal is unmet.
- *Next thing to try*: Vercel honours `CDN-Cache-Control` /
  `Vercel-CDN-Cache-Control` **separately** from the browser `Cache-Control`,
  specifically so dynamic routes can still be edge-cached. That is the
  documented mechanism and the obvious candidate — but it costs a deploy to
  verify, so it should not be assumed to work either.
- *Acceptance test*: two consecutive `curl -sI https://tarnoo.com/nl/trails`
  give `MISS` then `HIT`, **and** an admin-authenticated request never populates
  the shared cache.

**P2-2 · Activity-first URL architecture not implemented**
- *What*: the brief proposes `/hiking/{country}/{region}/{city}`. Today the
  geographic surface is `/discover/{region}/{category}`.
- *Why*: potentially large win, but it is a URL-architecture migration with
  redirect obligations. Needs design in `SEO_PAGE_ARCHITECTURE.md` and a
  measured count per proposed page type before any build.

**P1-4 · ~~Concurrent agent commits with `git add -A`~~ — CLOSED 2026-08-18: the UX agent has stopped, so the hazard no longer applies. Kept below for the record.**
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

**P3-4 · 1,213 trails have no top-down link (below the n≥8 region threshold)**
- *What*: after pagination, 28,945 of 30,174 visible trails are linked from a
  region page. The remaining **1,213** sit in regions that do not clear the n≥8
  anti-doorway gate, so no region page exists for them.
- *Why it is P3, not a bug*: they are all in the sitemap, and each trail page
  links 20 regional peers, so they are discoverable — just without a top-down
  path. Generating pages for those regions would mean creating thin pages, which
  the threshold exists to prevent.
- *Possible fix*: a country-level page (`/trails/{country}`) would cover them
  without thin regions — but that is a new indexable page type and needs its own
  measurement and threshold first.
- *Acceptance test*: every visible trail is reachable from at least one indexable
  listing page.

### P3 — optimizations

- **P3-1** `sitemap.ts` `changeFrequency`/`priority` are hand-set constants;
  Google ignores both. Harmless, low value to remove.
- **P3-3** LCP/CLS/INP **field** measurement — still no data, and collecting it
  needs a decision: real-user monitoring means an analytics dependency and a
  privacy/consent question. Lab numbers were taken instead (see Done).

**P2-6 · Hub pages share the generic site OpenGraph**
- *What*: measured in the delivered HTML — `/nl/discover` and `/nl/collections`
  have their own `<title>` and `meta description`, but their OG/Twitter tags are
  the **inherited site-level** ones: `og:title` = `Tarnoo`, `og:description` =
  `Plan je volgende avontuur`. Sharing either hub on social shows the brand, not
  the page.
- *Why it was not folded into the P1-1b refactor*: giving them page-specific OG
  is an **improvement**, not a behaviour-preserving migration. Mixing it into a
  refactor would have hidden a real content change behind a "no-op" claim.
- *Files*: `discover/layout.tsx`, `collections/layout.tsx` (and `[slug]`, which
  emits no OG at all).
- *Acceptance test*: `og:title` on `/nl/discover` reads `Ontdek routes`, not
  `Tarnoo`, and the OG image still resolves.

**P2-5 · The full i18n catalogue ships on every page (20,416 bytes)**
- *What*: measured in the delivered HTML of `/nl/discover` — the entire
  translation catalogue is serialised into the RSC payload on **every** page,
  including namespaces that page never uses (`planner`, `tourPage`,
  `resetPassword`, `trailPage`, …). At 20.4 kB it is now the single largest
  item in that page's payload, ahead of `thumb_coords` (9,748 B across 24
  routes) and far ahead of `waypoints` (1,713 B after the P1-10 trim).
- *Why it is not a quick fix*: next-intl can send a subset of messages to the
  client, but that means auditing which namespaces each client component
  actually calls and passing only those — it touches the locale layout and
  every client component. Worth doing, but as its own piece of work.
- *Files*: `src/app/[locale]/layout.tsx` (the `NextIntlClientProvider`), plus a
  namespace audit per client component.
- *Acceptance test*: `/nl/discover` HTML drops by roughly the size of the unused
  namespaces, with every page still rendering its own copy correctly in both
  locales.

### P2 — meaningful improvements

**P2-4b · `/nl/trails` is STILL not CDN-cached — the shipped fix does not work**
- *What*: after deploying, production returns
  `cache-control: private, no-cache, no-store, max-age=0, must-revalidate` and
  `x-vercel-cache: MISS` on three consecutive hits. The `Cache-Control` header
  configured in `next.config.mjs` is **overridden**.
- *Why my local verification was misleading*: `next start` applied the config
  header, so the local check passed. On Vercel, Next's dynamic-route handling
  sets its own no-store `Cache-Control` afterwards. A route that reads
  `searchParams` is always dynamically rendered, and Next marks those uncacheable
  by default. This is precisely the claim flagged as "not verifiable locally" —
  and it turned out false.
- *Not a regression*: the page still returns 200 and behaves exactly as before;
  the viewer-independence half of P2-4 (the `supabasePublic()` switch and the
  `/admin/trails` screen) stands on its own and was the actual safety fix.
  Only the caching goal is unmet.
- *Next thing to try*: Vercel honours `CDN-Cache-Control` /
  `Vercel-CDN-Cache-Control` **separately** from the browser `Cache-Control`,
  specifically so dynamic routes can still be edge-cached. That is the
  documented mechanism and the obvious candidate — but it costs a deploy to
  verify, so it should not be assumed to work either.
- *Acceptance test*: two consecutive `curl -sI https://tarnoo.com/nl/trails`
  give `MISS` then `HIT`, **and** an admin-authenticated request never populates
  the shared cache.

**P2-2 · Activity-first URL architecture not implemented**
- *What*: the brief proposes `/hiking/{country}/{region}/{city}`. Today the
  geographic surface is `/discover/{region}/{category}`.
- *Why*: potentially large win, but it is a URL-architecture migration with
  redirect obligations. Needs design in `SEO_PAGE_ARCHITECTURE.md` and a
  measured count per proposed page type before any build.

**P1-4 · ~~Concurrent agent commits with `git add -A`~~ — CLOSED 2026-08-18: the UX agent has stopped, so the hazard no longer applies. Kept below for the record.**
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

**P3-4 · 1,213 trails have no top-down link (below the n≥8 region threshold)**
- *What*: after pagination, 28,945 of 30,174 visible trails are linked from a
  region page. The remaining **1,213** sit in regions that do not clear the n≥8
  anti-doorway gate, so no region page exists for them.
- *Why it is P3, not a bug*: they are all in the sitemap, and each trail page
  links 20 regional peers, so they are discoverable — just without a top-down
  path. Generating pages for those regions would mean creating thin pages, which
  the threshold exists to prevent.
- *Possible fix*: a country-level page (`/trails/{country}`) would cover them
  without thin regions — but that is a new indexable page type and needs its own
  measurement and threshold first.
- *Acceptance test*: every visible trail is reachable from at least one indexable
  listing page.

### P3 — optimizations

- **P3-1** `sitemap.ts` `changeFrequency`/`priority` are hand-set constants;
  Google ignores both. Harmless, low value to remove.
- **P3-3** LCP/CLS/INP **field** measurement — still no data, and collecting it
  needs a decision: real-user monitoring means an analytics dependency and a
  privacy/consent question. Lab numbers were taken instead (see Done).

**P1-1b · Migrate the remaining routes onto `entityMetadata()`**
- *What*: six entity routes now build metadata through the shared helper —
  `trail/[id]`, `trails/[region]`, `tour/[id]`, `collection/[id]`,
  `highlight/[id]` and `discover/[region]/[category]`. Still hand-rolled:
  `user/[id]`, `[slug]`, and the hub layouts (`discover`, `collections`,
  `routes`, `feed`), which are simpler — no OG/Twitter blocks.
- *Why the rest is a separate slice*: each has its own quirks (the collection
  page varies its title by tour count, the highlight page's `robots` depends on
  a content-richness lookup), so they need migrating one at a time with the same
  before/after HTML diff — not a bulk sweep.
- *Acceptance test*: per migrated route, the delivered `<title>`, canonical, OG
  and Twitter tags are byte-identical to before.

### P2 — meaningful improvements

**P2-4b · `/nl/trails` is STILL not CDN-cached — the shipped fix does not work**
- *What*: after deploying, production returns
  `cache-control: private, no-cache, no-store, max-age=0, must-revalidate` and
  `x-vercel-cache: MISS` on three consecutive hits. The `Cache-Control` header
  configured in `next.config.mjs` is **overridden**.
- *Why my local verification was misleading*: `next start` applied the config
  header, so the local check passed. On Vercel, Next's dynamic-route handling
  sets its own no-store `Cache-Control` afterwards. A route that reads
  `searchParams` is always dynamically rendered, and Next marks those uncacheable
  by default. This is precisely the claim flagged as "not verifiable locally" —
  and it turned out false.
- *Not a regression*: the page still returns 200 and behaves exactly as before;
  the viewer-independence half of P2-4 (the `supabasePublic()` switch and the
  `/admin/trails` screen) stands on its own and was the actual safety fix.
  Only the caching goal is unmet.
- *Next thing to try*: Vercel honours `CDN-Cache-Control` /
  `Vercel-CDN-Cache-Control` **separately** from the browser `Cache-Control`,
  specifically so dynamic routes can still be edge-cached. That is the
  documented mechanism and the obvious candidate — but it costs a deploy to
  verify, so it should not be assumed to work either.
- *Acceptance test*: two consecutive `curl -sI https://tarnoo.com/nl/trails`
  give `MISS` then `HIT`, **and** an admin-authenticated request never populates
  the shared cache.

**P2-2 · Activity-first URL architecture not implemented**
- *What*: the brief proposes `/hiking/{country}/{region}/{city}`. Today the
  geographic surface is `/discover/{region}/{category}`.
- *Why*: potentially large win, but it is a URL-architecture migration with
  redirect obligations. Needs design in `SEO_PAGE_ARCHITECTURE.md` and a
  measured count per proposed page type before any build.

**P1-4 · ~~Concurrent agent commits with `git add -A`~~ — CLOSED 2026-08-18: the UX agent has stopped, so the hazard no longer applies. Kept below for the record.**
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

**P3-4 · 1,213 trails have no top-down link (below the n≥8 region threshold)**
- *What*: after pagination, 28,945 of 30,174 visible trails are linked from a
  region page. The remaining **1,213** sit in regions that do not clear the n≥8
  anti-doorway gate, so no region page exists for them.
- *Why it is P3, not a bug*: they are all in the sitemap, and each trail page
  links 20 regional peers, so they are discoverable — just without a top-down
  path. Generating pages for those regions would mean creating thin pages, which
  the threshold exists to prevent.
- *Possible fix*: a country-level page (`/trails/{country}`) would cover them
  without thin regions — but that is a new indexable page type and needs its own
  measurement and threshold first.
- *Acceptance test*: every visible trail is reachable from at least one indexable
  listing page.

### P3 — optimizations

- **P3-1** `sitemap.ts` `changeFrequency`/`priority` are hand-set constants;
  Google ignores both. Harmless, low value to remove.
- **P3-3** LCP/CLS/INP **field** measurement — still no data, and collecting it
  needs a decision: real-user monitoring means an analytics dependency and a
  privacy/consent question. Lab numbers were taken instead (see Done).

**P1-1 · SEO logic is scattered across page components** — *invariant done,
refactor deferred*
- *What remains*: canonical, title, OG and JSON-LD construction is still
  hand-rolled per route. The **canonical half is now enforced** by
  `canonical-guard.test.ts` (see Done), so the concrete failure mode — a new
  route shipping without a canonical — can no longer happen silently.
- *Why the refactor is deferred, not done*: moving metadata construction into a
  shared module touches ~8 route files the UX agent is actively working in, and
  produces **no behaviour change**. That is a poor trade during concurrent work.
  The invariant buys the safety now at near-zero collision risk.
- *Do it when*: the UX agent is idle, or the next new page type needs it anyway.
- *Acceptance test*: routes derive canonical/title from a shared helper, and the
  rendered HTML for each migrated route is byte-identical on title, canonical
  and JSON-LD.

### P2 — meaningful improvements

**P2-4b · `/nl/trails` is STILL not CDN-cached — the shipped fix does not work**
- *What*: after deploying, production returns
  `cache-control: private, no-cache, no-store, max-age=0, must-revalidate` and
  `x-vercel-cache: MISS` on three consecutive hits. The `Cache-Control` header
  configured in `next.config.mjs` is **overridden**.
- *Why my local verification was misleading*: `next start` applied the config
  header, so the local check passed. On Vercel, Next's dynamic-route handling
  sets its own no-store `Cache-Control` afterwards. A route that reads
  `searchParams` is always dynamically rendered, and Next marks those uncacheable
  by default. This is precisely the claim flagged as "not verifiable locally" —
  and it turned out false.
- *Not a regression*: the page still returns 200 and behaves exactly as before;
  the viewer-independence half of P2-4 (the `supabasePublic()` switch and the
  `/admin/trails` screen) stands on its own and was the actual safety fix.
  Only the caching goal is unmet.
- *Next thing to try*: Vercel honours `CDN-Cache-Control` /
  `Vercel-CDN-Cache-Control` **separately** from the browser `Cache-Control`,
  specifically so dynamic routes can still be edge-cached. That is the
  documented mechanism and the obvious candidate — but it costs a deploy to
  verify, so it should not be assumed to work either.
- *Acceptance test*: two consecutive `curl -sI https://tarnoo.com/nl/trails`
  give `MISS` then `HIT`, **and** an admin-authenticated request never populates
  the shared cache.

**P2-2 · Activity-first URL architecture not implemented**
- *What*: the brief proposes `/hiking/{country}/{region}/{city}`. Today the
  geographic surface is `/discover/{region}/{category}`.
- *Why*: potentially large win, but it is a URL-architecture migration with
  redirect obligations. Needs design in `SEO_PAGE_ARCHITECTURE.md` and a
  measured count per proposed page type before any build.

**P1-4 · ~~Concurrent agent commits with `git add -A`~~ — CLOSED 2026-08-18: the UX agent has stopped, so the hazard no longer applies. Kept below for the record.**
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

**P3-4 · 1,213 trails have no top-down link (below the n≥8 region threshold)**
- *What*: after pagination, 28,945 of 30,174 visible trails are linked from a
  region page. The remaining **1,213** sit in regions that do not clear the n≥8
  anti-doorway gate, so no region page exists for them.
- *Why it is P3, not a bug*: they are all in the sitemap, and each trail page
  links 20 regional peers, so they are discoverable — just without a top-down
  path. Generating pages for those regions would mean creating thin pages, which
  the threshold exists to prevent.
- *Possible fix*: a country-level page (`/trails/{country}`) would cover them
  without thin regions — but that is a new indexable page type and needs its own
  measurement and threshold first.
- *Acceptance test*: every visible trail is reachable from at least one indexable
  listing page.

### P3 — optimizations

- **P3-1** `sitemap.ts` `changeFrequency`/`priority` are hand-set constants;
  Google ignores both. Harmless, low value to remove.
- **P3-3** LCP/CLS/INP **field** measurement — still no data, and collecting it
  needs a decision: real-user monitoring means an analytics dependency and a
  privacy/consent question. Lab numbers were taken instead (see Done).

**P2-4 · `/nl/trails` is never CDN-cached**
- *What*: measured on production — `x-vercel-cache: MISS` on three consecutive
  hits, 631,205 bytes, TTFB 3.30s cold and ~0.30–0.38s warm. Every other route
  is 0.10–0.32s and HIT/STALE.
- *Cause*: `export const dynamic = "force-dynamic"` (line 19) plus
  `supabaseServer()`, which reads cookies. So the route re-renders and re-queries
  Supabase on every single request, including every crawler hit on the entry
  point to 30,265 trail pages.
- **Hazard that blocks the obvious fix**: naively adding `Cache-Control:
  s-maxage` would let the CDN serve one user's render to everyone — and because
  `trails_select` is `hidden_at IS NULL OR is_admin()`, an **admin's** render
  contains the 91 hidden trails. Caching that would leak them to anonymous
  visitors. Any fix must first make the query provably viewer-independent (plain
  anon fetch instead of `supabaseServer()`), exactly as `/discover` and
  `/collections` now do.
- *Files*: `src/app/[locale]/trails/page.tsx` (541 lines, UX-owned).
- *Acceptance test*: repeat hits return `x-vercel-cache: HIT`, and an
  admin-authenticated request never populates the shared cache.

---

## In progress

_(empty — P0-1 completed this iteration)_

**Next up**: nothing open. P3-3 (field performance data) is parked until
traffic justifies the instrumentation. Everything else is deployed and verified
against production.

---

## Done

### 2026-08-18 — P2-7: region pages paginated, 4,701 trails recovered

*Found by a fresh audit sweep after the deploy* — the region pages capped their
list at `TRAIL_LIST_LIMIT` (300) with no pager, so everything past #300 was
listed nowhere:

| Measure | Count |
|---|---|
| visible trails | 30,174 |
| in regions with a page (n ≥ 8) | 28,945 |
| **actually linked before** (300-cap) | **24,244 (80.3%)** |
| lost to the cap, across 19 oversized regions | **4,701** |
| **linked after pagination** | **28,945 (95.9%)** |

*Why pagination and not a bigger cap*: measured page weight is ~1.4 kB per
trail (the RSC payload repeats the rendered list), so `/nl/trails/zuid-holland`
is 213 kB for 146 links. Bayern's 1,113 trails on one page would be ~1.3 MB.

*Implementation*: `?page=N`, 1-based, in the shared data layer. Out-of-range,
zero and non-numeric pages **404** rather than rendering an empty page. Page
title carries `— Pagina N van M` so pages 2+ are not SERP duplicates, and each
page **self-canonicals to itself** — consolidating to page 1 would devalue
exactly the links this pagination exists to expose. Pager is real `<a>` links,
not client-side, or page 2+ would be as unreachable as before.

*Evidence*:

| Check | Result |
|---|---|
| `/nl/trails/bayern`, `?page=2`, `?page=4` | 200 · titles `— Pagina 1/2/4 van 4` · canonical matches each page |
| `?page=5`, `?page=0`, `?page=abc` | **404** |
| page 2 content | 300 trail links, pager links to page 1 and 3 |
| single-page region (`aargau`) | unchanged — no page suffix, no pager rendered |
| sitemap | 8,196 → **8,252** (+56 paginated URLs) |
| regression | `/nl`, `/nl/trails`, `/nl/discover`, `/nl/collections`, `/nl/trails/aargau`, `/robots.txt` all 200 |

*A silent failure worth recording*: the first pass at the metadata edit did not
apply — I had asserted on some string replacements but not that one, so it
no-op'd and the build stayed green while page 2 still served page 1's title and
canonical. Caught only because the rendered-HTML check compares actual output.
Re-applied with an assertion.

*Gates*: `npm test` 37/37 · `next lint` clean · `tsc --noEmit` exit 0 ·
`npm run build` exit 0.

### 2026-08-18 — P2-4b: `/nl/trails` is now genuinely CDN-cached

The first attempt shipped a plain `Cache-Control` in `next.config.mjs` and
failed in production: `/trails` reads `searchParams`, so Next renders it
dynamically and overwrites `Cache-Control` with
`private, no-cache, no-store`. `next start` does not apply that override, which
is why the local check passed — a false positive.

*Fix*: drop the browser header, set only the CDN-scoped ones, which Next does
not touch and which exist precisely so dynamic routes can still be edge-cached:
`Vercel-CDN-Cache-Control` and `CDN-Cache-Control` =
`public, s-maxage=3600, stale-while-revalidate=86400`.

*Evidence — production, four consecutive requests*:

| Hit | x-vercel-cache | age | TTFB |
|---|---|---|---|
| 1 | **HIT** | 7 | 0.495s |
| 2 | **HIT** | 12 | 0.234s |
| 3 | **HIT** | 16 | **0.087s** |
| 4 | **HIT** | 21 | 0.101s |

Was `MISS` on every hit at ~0.35s warm. Filtered variants cache per full URL as
expected: `?sport=hike` and `?country=NL` each `MISS` on first request, then
`HIT`.

*Safety property re-verified under caching*, because this is the combination
that could have leaked: hidden trails stay hidden. Search `Stevenson` → **0**
results, direct `/nl/trail/6f8b32ce-…` → **404**, control search `Waldroute` →
**1** result. The cached render is anonymous-only by construction
(`supabasePublic()`), so an admin's view can never populate the shared cache.

Page content intact: 200 trail links, `<title>Officiële routes | Tarnoo</title>`.

### 2026-08-18 — deployed and verified against production

23 commits pushed and live. Verified on `tarnoo.com`, not locally:

| Check | Result |
|---|---|
| region landing pages | `/nl/trails/aargau`, `/nl/trails/zuid-holland`, `/nl/trails/limburg-nl` → **200** |
| anti-doorway gate holds in prod | `/nl/trails/essex` (n=7) → **404**; bare `/nl/trails/limburg` (collision) → **404** |
| sitemap | **8,196** URLs, of which **443** `/nl/trails/<regio>` |
| orphans fixed | `/nl/discover`: **21** tour links + **60** region links; `/nl/collections`: **5** collection links (all were 0) |
| uppercase duplicates | `/nl/TRAILS` and `/nl/DiScOvEr` → **308** to lowercase |
| auth-gated hubs | `/nl/routes`, `/nl/feed` → `noindex, follow` |
| hub OpenGraph | `og:title` = `Ontdek routes` (was `Tarnoo`) |
| trail breadcrumb parent | `/nl/trail/00015b65-…` → `/nl/trails/nordrhein-westfalen` |

**One thing did not work: P2-4's caching.** See P2-4b in the backlog — the
`next.config.mjs` `Cache-Control` is overridden in production and `/nl/trails`
still reports `x-vercel-cache: MISS`. The local check passed because
`next start` has no such override, which is exactly why that claim was recorded
as unverified rather than done.

### 2026-08-18 — P2-5 closed as not worth doing (measured, not assumed)

I filed this saying the i18n catalogue shipped namespaces "that page never
uses". **That was wrong, and measuring it is what showed me.**

Census of all **39** client components: they call **18** of the 22 namespaces.
Only four are unused client-side:

| Namespace | bytes |
|---|---|
| `trailsPage` | 966 |
| `trailPage` | 942 |
| `trailRegionPage` | 646 |
| `app` | 229 |
| **droppable total** | **2,783 of 19,558 (14.2%)** |

That is ~2.5% of the 111 kB `/discover` page. And the largest namespace,
`planner` (4,740 bytes, 24.6% of the catalogue), is used by 13 client
components **including `AppHeader`**, which the locale layout renders on every
page — so it cannot be dropped anywhere.

Against that ~2.8 kB sits a real fragility: passing an explicit subset to
`NextIntlClientProvider` means a client component added later that calls a
dropped namespace fails at runtime with a missing-message error. Guarding that
would need yet another source-scanning invariant.

Not a good trade. Moved to *Deliberately not doing*. Per-route message
splitting would be the real lever, but that is a much larger change than an SEO
payload tweak justifies.

### 2026-08-18 — P2-6: the two hubs now have their own OpenGraph

Flagged in the previous iteration and deliberately kept out of the refactor,
because this one **does** change output. `/discover` and `/collections` had
their own `<title>` and `meta description` but inherited the site-level OG, so
sharing either hub showed the brand instead of the page.

| Route | og:title before → after | og:description after |
|---|---|---|
| `/nl/discover` | `Tarnoo` → **`Ontdek routes`** | `Kant-en-klare rondjes van de community en redactie.` |
| `/nl/collections` | `Tarnoo` → **`Collecties`** | `Samengestelde routesets — thematische ritten en wandelingen om te volgen.` |
| `/en/discover` | `Tarnoo` → **`Discover routes`** | `Hand-picked and community loops, ready to ride or walk.` |

Both hubs now route through `entityMetadata()`, so they gained the shared
canonical handling too. `og:image` still resolves: `/nl/opengraph-image` →
**200 `image/png`**.

*Regression*: `/nl`, `/nl/trails`, `/nl/discover`, `/nl/collections`,
`/nl/trails/aargau`, `/nl/routes`, `/sitemap.xml`, `/robots.txt` all 200, and
the crawlable links are untouched — 21 tour links and 60 region links on
`/nl/discover`, 5 collection links on `/nl/collections`.

*Gates*: `npm test` 37/37 · `next lint` clean · `tsc --noEmit` exit 0 ·
`npm run build` exit 0.

### 2026-08-18 — P1-1b finished for the entity routes: `user/[id]` migrated

Seven routes now build metadata through `entityMetadata()`: `trail/[id]`,
`trails/[region]`, `tour/[id]`, `collection/[id]`, `highlight/[id]`,
`discover/[region]/[category]` and `user/[id]`.

*Evidence — byte-identical*: `/nl/user/b60c3f2a-…` (7 meta lines) unchanged,
plus `/nl/discover`, `/nl/collections` and `/en/collections` as untouched
controls — all **IDENTICAL**.

*The private-profile `noindex` branch* is a pass-through of the same conditional
into the helper's `robots` option, and that option is already proven in both
directions by the highlight page (`index, follow` vs `noindex, follow`). Not
re-stubbed this round — the database currently has 0 private profiles, so there
is nothing live to exercise it against.

*Deliberately left hand-rolled, with reason* — this is where the migration
stops being a refactor:
- `discover/layout.tsx`, `collections/layout.tsx`: they inherit the site-level
  OG. Routing them through the helper would replace `og:title` `Tarnoo` with the
  page title — an improvement, filed as **P2-6**, but not a no-op.
- `[slug]` (CMS): emits no OG/Twitter at all today, and all three `pages` rows
  are `published = false`, so any change there is unverifiable by rendered HTML.
- `routes/layout.tsx`, `feed/layout.tsx`: `noindex` with no canonical and no OG.
  Nothing for the helper to unify.

*Gates*: `npm test` 37/37 · `next lint` clean · `tsc --noEmit` exit 0 ·
`npm run build` exit 0.

### 2026-08-18 — P1-1b: `highlight/[id]` and `discover/[region]/[category]` migrated

Six of the entity routes are now on `entityMetadata()`. Nothing new had to be
added to the helper this round — `robots`, `socialTitle` and `ogImage` covered
both pages, which is a decent sign the abstraction is the right shape.

*Evidence — byte-identical delivered metadata, both `robots` branches included*:

| Route | robots | Result |
|---|---|---|
| `/nl/highlight/ff87ca06-…` (content-rich) | `index, follow` | **IDENTICAL** (17 lines) |
| `/nl/highlight/00002a8e-…` (thin) | `noindex, follow` | **IDENTICAL** (17 lines) |
| `/en/highlight/ff87ca06-…` | `index, follow` | **IDENTICAL** (17 lines) |
| `/nl/discover/aargau/hut` | — | **IDENTICAL** (10 lines) |

Testing both highlight branches mattered: the content-rich gate is what keeps
~500k thin OSM pages out of the index, and a happy-path-only diff would not have
touched it. Deliberately picked one id from `content_rich_highlights` and one
that is absent from it.

*The build caught a leftover*: removing the hand-rolled metadata left
`getSiteSettings`/`pageTitle` unused in the region page, and `next build` failed
on it rather than shipping dead imports. Removed, then green.

*Gates*: `npm test` 37/37 · `next lint` clean · `tsc --noEmit` exit 0 ·
`npm run build` exit 0 · regression: `/nl`, `/nl/trails`, `/nl/discover`
(60 region links intact), `/nl/collections`, `/nl/trails/aargau`,
`/sitemap.xml` all 200.

### 2026-08-18 — P1-1b: `tour/[id]` and `collection/[id]` migrated

*Two real quirks the helper did not yet express*, found by reading the routes
rather than assuming they matched:
- **Neither page brands its title.** `/nl/tour/…` renders
  `Utrecht naar Amersfoort | 21.5 km Fietsen` — no `| Tarnoo` suffix. Migrating
  blindly would have appended the brand to every indexed tour and collection
  title. Added an explicit `brand` option (default on) and set it `false` here.
- **The tour's share description differs from its meta description** — the
  author byline is appended to `description` only, not to the OG/Twitter text.
  Added `socialDescription`.
- Collection's conditional thin-content `robots` passes through a new `robots`
  option.

*Evidence — byte-identical delivered metadata*:

| Route | Result |
|---|---|
| `/nl/tour/8b8c6123-…` (16 meta lines) | **IDENTICAL** |
| `/en/tour/8b8c6123-…` (16 meta lines) | **IDENTICAL** |
| `/nl/collection/c068af01-…` (16 meta lines) | **IDENTICAL** |

*Conditional branch verified separately*, since a diff of the happy path would
not have caught it. Two public collections whose members are all non-public
(`71b42845-…`, `0befd30e-…`, both 0 public tours of 2 items) still render
`<meta name="robots" content="noindex"/>`, still carry their canonical, still
show the unsuffixed title, and are still absent from the sitemap (0 matches).

*Gates*: `npm test` 37/37 · `next lint` clean · `tsc --noEmit` exit 0 ·
`npm run build` exit 0.

### 2026-08-18 — P1-1 refactor half started: shared `entityMetadata()`

*Change*: new `src/lib/seo/entityMetadata.ts` builds title, description,
canonical, OpenGraph and Twitter from one place; `trail/[id]` and
`trails/[region]` migrated onto it. The helper always sets a canonical, so the
class of bug that produced P1-1 cannot recur in a route that uses it.

*Evidence — byte-identical output, which is the whole point of a refactor*.
Captured `<title>`, `<link rel=canonical>`, all `og:*`, all `twitter:*` and
`meta description` from the delivered HTML before and after, then diffed:

| Route | Result |
|---|---|
| `/nl/trail/00015b65-…` (16 meta lines) | **IDENTICAL** |
| `/nl/trails/aargau` (10 meta lines) | **IDENTICAL** |
| `/en/trails/aargau` (10 meta lines) | **IDENTICAL** |
| `/nl/collection/c068af01-…` (16 meta lines, not migrated — control) | **IDENTICAL** |

*The canonical guard caught the migration*, correctly: the migrated routes no
longer contain a literal `alternates: { canonical`, so the invariant failed. It
now also accepts `entityMetadata(` — otherwise it would flag every migration to
the shared layer as a regression, which is the opposite of the intent.
Re-verified it can still fail: a new route using neither form turns it red
(`zzzcheck/page.tsx`).

*Gates*: `npm test` 37/37 · `next lint` clean · `tsc --noEmit` exit 0 ·
`npm run build` exit 0 · regression: `/nl`, `/nl/trails`, `/nl/discover`,
`/nl/collections`, `/nl/trails/aargau`, `/nl/trail/00015b65-…`, `/sitemap.xml`
all 200, and `/nl/trails/essex` (below the n≥8 threshold) still 404.

### 2026-08-18 — P1-10 partial: `/discover` payload trimmed 17%

*Two measured causes, both addressed*:
1. Only `waypoints[0]` is ever read (distance sorting, line 344 of
   `DiscoverClient`), but every route carried its full waypoint list. The server
   now trims to the single element that is used — `waypoints` is down to
   **1,713 bytes** total.
2. All 230 combos were serialised although at most `MAX_CHIPS` (60) ever render.
   The merge moved server-side into a shared pure module
   (`src/lib/seo/comboMerge.ts`), used by **both** the server wrapper and the
   client — no second copy. It is idempotent by design, so the client re-running
   it over already-merged server data is safe, and the client's own
   fetch-all-230 fallback path is unchanged.

| Measure | Before | After |
|---|---|---|
| `/nl/discover` HTML | 134,161 B | **111,655 B** (−22,506, −17%) |
| `/en/discover` HTML | — | 110,448 B |
| tour links | 21 | 21 |
| region links | 60 | 60 |

*Behaviour preserved*: the nl locale still leads with Benelux chips
(`liege/monument`, `namur/monument`, `antwerp/monument`, …) and still renders
the "Ontdek in de Benelux" / "Elders in Europa" split; `en` keeps the global
order (`bayern/peak`, `nordrhein-westfalen/nature`, …).

*Honest status — the acceptance test is not met.* It asked for under ~90 kB and
this lands at 111.6 kB. Breaking down what remains: **20,416 B is the i18n
catalogue**, 9,748 B is `thumb_coords` (genuinely needed — it feeds both the
MiniMap thumbnail and `isLoopRoute()`), 1,713 B waypoints. The i18n payload is
now the biggest lever and is a separate cross-cutting change, filed as **P2-5**.
`thumb_coords` cannot be dropped without breaking the hub. So P1-10 is closed as
"trimmed as far as this route allows" rather than marked fully green.

*Gates*: `npm test` 37/37 · `next lint` clean · `tsc --noEmit` exit 0 ·
`npm run build` exit 0.

### 2026-08-18 — P2-4 `/trails` made viewer-independent and cacheable

*Precondition first*: there was **no admin trails screen** — the 91 `hidden_at`
trails were visible only because a logged-in admin opening the **public**
`/trails` page got them back through RLS (`hidden_at IS NULL OR is_admin()`).
That is exactly what made the page uncacheable: caching an admin's render would
have served the hidden trails to everyone. Built `/admin/trails` (list, search,
all/visible/hidden filter, hide/unhide with `admin_audit`) so the capability has
its own home. Bonus: `hidden_at` previously had no UI at all and could only be
set via SQL.

*Then the fix*: new `supabasePublic()` — a sessionless anon client — replaces
`supabaseServer()` (which reads cookies) in `trails/page.tsx`, so every visitor
now gets an identical render. `force-dynamic` removed, and a CDN header added in
`next.config.mjs` scoped to `/:locale(nl|en)/trails`:
`public, s-maxage=3600, stale-while-revalidate=86400`. The region pages don't
match that source — they have an extra segment and already cache via ISR.

*Evidence*:

| Check | Result |
|---|---|
| `/nl/trails` | 200, 200 trail links, `Officiële routes \| Tarnoo`, canonical present |
| `Cache-Control` on the response | `public, s-maxage=3600, stale-while-revalidate=86400` |
| filters still work | `?sport=hike` 200/200 links · `?country=NL` 200/200 · `?q=waldroute` 200/1 |
| **hidden trail excluded** | search `Stevenson` → **0** results; `GR 121 liaison` → **0**; direct `/nl/trail/6f8b32ce-…` → **404** |
| visible control | search `Waldroute` → 1 result (still findable) |
| regression | `/nl`, `/nl/discover`, `/nl/collections`, `/nl/trails/aargau`, `/sitemap.xml`, `/robots.txt` all 200 |

*Not yet verifiable*: whether Vercel's CDN actually returns `x-vercel-cache: HIT`
can only be confirmed after a deploy — a local `next start` has no CDN. The
header is emitted correctly, which is the part that can be checked here.

*Gates*: `npm test` 37/37 · `next lint` clean · `tsc --noEmit` exit 0 ·
`npm run build` exit 0.

### 2026-08-18 — P3-2 closed as no-defect, plus lab performance numbers

*P3-2 (image `alt`/`loading` sweep) had nothing to fix.* The backlog entry came
from a generic checklist; measuring the actual markup dissolved it:

- The whole codebase contains **8** `<img>` tags and no `next/image`. Five are
  admin-only (`noindex`), one is the MFA QR code behind auth.
- The delivered HTML of `/nl`, `/nl/trails`, `/nl/discover`, `/nl/collections`
  and `/nl/trails/aargau` contains **exactly one** `<img>` each: the header
  logo, an inline `data:` SVG with `alt=""` inside `<a aria-label="Tarnoo">` —
  correct decorative-image markup, and no network request.
- `Avatar.tsx` already sets `alt`, `width`, `height`, `loading="lazy"` and
  `decoding="async"`.
- The highlight photo grid is the only other public image code, and
  `highlight_photos` contains **0 rows**, so it never renders on any live page.

*Lab performance* (local production build + browser Performance API on
`/nl/trails`): **CLS 0**, 12 resources, 180 KB transferred, 11 JS files /
173 KB. No layout shift to fix.

*Production timing per route* (`curl` timing + `x-vercel-cache`):

| Route | TTFB | size | cache |
|---|---|---|---|
| `/nl` | 0.12s | 42,790 B | HIT |
| `/nl/discover` | 0.11s | 42,404 B | STALE |
| `/nl/trails/aargau` | 0.23s | 6,076 B | HIT |
| `/nl/trail/00015b65-…` | 0.32s | 109,437 B | MISS |
| `/nl/trails` | **3.30s cold / ~0.35s warm** | **631,205 B** | **MISS ×3** |

That last row is a real finding and is filed as **P2-4** — not fixed here,
because the obvious cache fix would leak admin-visible hidden trails. See the
backlog entry.

### 2026-08-18 — iteration-10 re-audit + uppercase URL duplicates fixed

*Re-audit sweep against production* (the brief asks for a full one every 10th
iteration). Checked and found **healthy**, recorded so they are not re-chased:

| Check | Result |
|---|---|
| trailing slash | `/nl/trails/` → 308 → `/nl/trails` |
| double slash | `//nl/trails` → 308 → `/nl/trails` |
| unknown slug | `/nl/does-not-exist` → 404 |
| unknown entity id | `/nl/trail/0000…0000` → 404 (not soft-404) |
| locale case | `/NL/trails` → redirect to `/nl/trails` |

*Defect found*: path segments resolve **case-insensitively** on Vercel.
`/nl/TRAILS`, `/nl/Trails`, `/nl/DiScOvEr` and `/nl/Collections` each returned
**200 with full content** (200 trail links on the first). A genuinely unknown
slug still 404s, so this is case-folding, not a catch-all. The self-canonical
already pointed at the lowercase URL, so Google would consolidate — but they
remain crawlable duplicates, and any mistyped external link mints another.

*Change*: `src/middleware.ts` now 308-redirects any path containing uppercase
to its lowercase form, preserving the query string.

*Safety check before writing it* — every URL identifier in this app is already
lowercase, verified against the database rather than assumed:

| Column | rows differing from `lower()` |
|---|---|
| `trails.id`, `tours.id`, `collections.id`, `highlights.id`, `profiles.id` | **0** each |
| `pages.slug` | **0** |
| `trail_regions.region` | 875 — but that is the *display* name; the URL uses `slugify()`, which lowercases |

Noted in the middleware comment: if a case-sensitive slug is ever introduced,
this redirect has to change with it.

*Evidence*:

| Request | Result |
|---|---|
| `/nl/TRAILS` | 308 → `/nl/trails` |
| `/nl/Trails`, `/nl/DiScOvEr`, `/nl/Collections` | 308 → lowercase |
| `/nl/TRAILS?utm_source=x` | 308 → `/nl/trails?utm_source=x` (query preserved) |
| `/NL/trails`, `/Nl` | 308 → `/nl/trails`, `/nl` |
| `/nl/trails`, `/nl/discover`, `/nl/collections`, `/nl/trails/aargau`, `/nl/trail/00015b65-…`, `/nl`, `/robots.txt`, `/sitemap.xml` | all 200, unaffected |
| `/api/discover/combos`, `/_next/static/…js` | 200, excluded by the matcher |

Following the redirect yields the correct page (`Officiële routes | Tarnoo`)
with its canonical intact.

*Gates*: `npm test` 37/37 · `next lint` clean · `tsc --noEmit` exit 0 ·
`npm run build` exit 0 · diff is one file.

### 2026-08-18 — P1-1 slice 1: canonical coverage closed and made enforceable

*Audit first*: 11 routes declared `alternates.canonical`; two indexable ones
did not — `/{locale}/collections` (a hub, in the sitemap) and `/{locale}/{slug}`
(the CMS pages). Both were reachable with `?utm_*`/`?fbclid` as separate URLs
with identical content.

*Change*: added a self-canonical to both, plus
`src/lib/seo/canonical-guard.test.ts` — every route under `src/app/[locale]`
that builds its own metadata must set a canonical, set itself `noindex`, or be
listed in `EXEMPT` with a written reason (currently two entries: the site-wide
`layout.tsx`, where a canonical would point every page at the homepage, and
`reset-password`, a token-bearing auth flow).

*Evidence*:

| Request | HTTP | canonical |
|---|---|---|
| `/nl/collections` | 200 | `…/nl/collections` |
| `/nl/collections?utm_source=x&fbclid=y` | 200 | `…/nl/collections` (consolidated) |
| `/en/collections` | 200 | `…/en/collections` |

*Mutation checks*: removing the canonical from `/collections` → red
(`collections/layout.tsx`); adding a brand-new route with metadata and no
canonical → red (`zzznew/page.tsx`). Both restored.

*Not verified, and why*: the CMS `[slug]` canonical has **no rendered-HTML
evidence**. All three `pages` rows (`over`, `privacy`, `voorwaarden`) are
`published = false`, so `/nl/over`, `/nl/privacy` and `/nl/voorwaarden` all
return 404 — correct behaviour, but it means the canonical on that route is
covered only by the source invariant until a page is published.

*Gates*: `npm test` 37/37 (5 suites) · `next lint` clean · `tsc --noEmit`
exit 0 · `npm run build` exit 0 · regression: `/nl`, `/nl/trails`,
`/nl/discover` (60 region links intact), `/nl/trails/aargau`, `/nl/routes`,
`/sitemap.xml` all 200.

### 2026-08-18 — P1-9 the double fetch on `/discover` is gone

After server-rendering the hub, the client still refetched the same tours and
the same combos immediately after hydration — the data was paid for twice on
every visit.

*Change*: `DiscoverClient` now skips its initial tours fetch when `initialRows`
is non-empty, and its `/api/discover/combos` fetch when `initialCombos` is
non-empty. Both guards fall back to the old behaviour when server data is
missing (a failed server fetch returns `[]`), so a Supabase blip degrades to
the previous client-side path rather than an empty page. The server wrapper
revalidates hourly, so what a visitor sees is exactly as fresh as before.

*Evidence — browser network log, not source reasoning*: loading
`http://localhost:3231/nl/discover` records only the document and 13 JS/CSS
chunks. **No `rest/v1/tours` request and no `/api/discover/combos` request.**
Page text confirms the hub still renders in full — featured rail, sport and
distance filters, sort control and the route list.

*Honest limit*: this removes the redundant requests, not the payload. HTML is
unchanged at 134,161 bytes with 21 tour links and 60 region links. Reducing
that further means trimming data the UI actually uses — filed as P1-10.

*Gates*: `npm test` 33/33 · `next lint` clean (dependency array corrected
rather than suppressed) · `tsc --noEmit` exit 0 · `npm run build` exit 0 ·
`/nl/collections` still 200.

### 2026-08-18 — P1-8 region×category chips are now in the delivered HTML

The chips are links into the 3,625 region×category pages, and they were the
last listing still fetched client-side. `/nl/discover` and `/en/discover` now
each carry **60** `discover/{region}/{category}` links in the HTML (was 0).
Spot-checked that they are not links into 404s: `/nl/discover/antwerp/monument`,
`/nl/discover/baden-wurttemberg/hut` and `/nl/discover/baden-wurttemberg/peak`
all return 200.

*Approach*: the logic moved verbatim from `/api/discover/combos/route.ts` into
`src/lib/seo/discoverCombos.ts`; the route is now a thin wrapper over it and
the `/discover` server page calls the same function. Copying the query instead
would have duplicated three pieces of hard-won behaviour — the deliberate
absence of `order=n.desc` (it times out over 500k rows), the per-page retry,
and slug-collision resolution across the *full* set before truncating to 200.
Two copies of that would drift, which is exactly why `lib/regionSlug.ts` exists.

*Gates*: `/api/discover/combos` still 200 with 230 items · `npm test` 33/33 ·
`next lint` clean · `tsc --noEmit` exit 0 · `npm run build` exit 0 ·
regression: `/nl`, `/nl/trails`, `/nl/collections`, `/nl/trails/aargau`,
`/en/discover`, `/sitemap.xml` all 200.

### 2026-08-18 — P1-5 (option A): both hubs now ship crawlable links

The orphan problem is closed. `/discover` and `/collections` fetched their
listings in `useEffect`, so the delivered HTML contained no links at all; the
21 public tours and 5 public collections were reachable only via the sitemap.

| URL | HTML bytes before → after | tour links | collection links |
|---|---|---|---|
| `/nl/discover` | 42,341 → 91,151 | **0 → 21** | 0 |
| `/en/discover` | — | **0 → 21** | 0 |
| `/nl/collections` | 39,762 → 46,253 | 0 | **0 → 5** |

*Approach*: `git mv page.tsx → {Discover,Collections}Client.tsx` (rename stays
traceable for the UX agent), plus a thin server `page.tsx` that preloads the
public rows and passes them as props. The client bodies changed by two or three
lines each — state initialises from props, and `loading` starts false when
server data exists so the skeleton does not briefly replace already-rendered
cards. No classNames, styling or layout touched. Filters, sorting and
geolocation stay entirely client-side.

*Two genuine guard defects this work exposed* — in both the guard stayed green
where it should have failed, which is the worst failure mode for a guard:
1. It recognised only `.from("…")` and a literal `rest/v1/<table>`. The new
   `/discover` wrapper built its URL from a `REST` constant, so the query was
   invisible to the scan. The guard now also knows the `<table>?select=` form,
   and the page deliberately keeps table name and filters adjacent in source.
2. The chain window cut only at the next `.from(`. `/discover` has two tours
   queries, so chain #1 read chain #2's filter and a deleted filter passed.
   The window now cuts at any query form.
Mutation after both fixes: removing `visibility=eq.public` from the first
`/discover` query turns the suite red on `keten #1`.

*Gates*: `npm test` 33/33 · `next lint` clean · `tsc --noEmit` exit 0 ·
`npm run build` exit 0 · regression: `/nl`, `/nl/trails`, `/nl/trails/aargau`,
`/nl/routes`, `/nl/feed`, `/en/collections`, `/robots.txt`, `/sitemap.xml`
all 200.

### 2026-08-18 — P1-6 + P1-7: trail-region landing pages, and the link graph around them

The 30,265 trail pages had no indexable geographic parent. Both links that
should have pointed at one — the trail breadcrumb and the "routes in this
region" cross-link on the region×category pages — pointed at
`/trails?country=…&region=…`, which `/trails` canonicalises away. The links
existed; the destination did not.

**Threshold measured before generating anything** (visible trails only, i.e.
excluding the 91 `hidden_at` rows):

| Minimum trails | Regions | Trails covered | Coverage |
|---|---|---|---|
| n ≥ 5 | 533 | — | — |
| **n ≥ 8 (chosen)** | **443** | **28,945 / 30,158** | **96.0%** |
| n ≥ 12 | 367 | 28,234 | 93.6% |

`n ≥ 8` matches the existing gate for `/discover/{region}/{category}` — the
brief requires applying a threshold consistently, not inventing a new one per
page type — and gives the best balance: 443 pages is a small, defensible index
that still gives 96% of routes a parent. Below the threshold the page does not
exist (404), rather than existing as a thin `noindex`.

*New DB object*: view `public.trail_regions` (aggregate per region+country over
visible trails). A plain view, deliberately **not** a materialized view like
`highlight_regions`, which needs periodic `REFRESH` and can go stale silently;
this aggregate is cheap and ISR-cached anyway. `security_invoker = on` plus an
explicit `hidden_at` filter, so anon never sees more than `trails_select` allows.

*Evidence*:

| Check | Result |
|---|---|
| `/nl/trails/aargau` | 200 · `25 officiële routes in Aargau \| Tarnoo` · canonical · 25 crawlable trail links · BreadcrumbList + ItemList |
| `/en/trails/aargau` | 200 · `25 official routes in Aargau \| Tarnoo` |
| `/nl/trails/zuid-holland` | 200 · `146 officiële routes in Zuid-Holland` · 146 trail links |
| threshold boundary | `essex`/`padova`/`eure`/`panevezio` (n=7) → **404**; `brindisi`/`conwy`/`csongrad` (n=8) → **200** |
| slug collisions | `/nl/trails/limburg` → 404; `limburg-nl` → 200; `limburg-be` → 200 |
| sitemap | 7,310 → **8,196** URLs (+443 × 2 locales) |
| trail page | breadcrumb + BreadcrumbList item 2 → `/nl/trails/nordrhein-westfalen`; **0** leftover `trails?country=` links |
| region×category page | cross-link → `/nl/trails/aargau`; **0** leftover query-param links |

*Also verified healthy*: `trails.hidden_at` is set on 91 rows and appears
nowhere in `src/` — because RLS handles it
(`trails_select USING (hidden_at IS NULL OR is_admin())`). Not a bug; the new
view filters it explicitly as well.

*Noted during verification*: a transient Supabase 500 surfaced as a 5xx rather
than a cached 404 — exactly what the throw-instead-of-`[]` design in the REST
helper is for. A cached 404 would have deindexed a valid region page for up to
an hour.

*Gates*: `npm test` 31/31 · `next lint` clean · `tsc --noEmit` exit 0 ·
`npm run build` exit 0 · regression: `/nl`, `/nl/trails`, `/nl/discover`,
`/nl/collections`, `/nl/routes`, `/robots.txt`, `/sitemap.xml` all 200.

### 2026-08-18 — P2-1 `/routes` and `/feed` are no longer indexable

*Verified the symptom first on production*: both returned **HTTP 200 with no
robots meta and no canonical**, and neither is in the sitemap — so they were
indexable purely through internal header links. Anonymously `/nl/routes`
renders `Mijn routes` + "Log in om je opgeslagen routes te zien" and a login
form; `/nl/feed` renders the `feed.needLogin` empty state. A search result
titled "Mijn routes" that shows a stranger a login form is both thin and
misleading.

*Change*: `robots: { index: false, follow: true }` in the two server layouts
(`routes/layout.tsx`, `feed/layout.tsx`). `follow: true` matches the existing
convention for non-indexable utility routes in this repo (`embed/layout.tsx`);
`admin/layout.tsx` uses `follow: false` because it is disallowed in robots.txt
as well.

*Rendered-HTML evidence* (production build):

| URL | HTTP | robots meta | title |
|---|---|---|---|
| `/nl/routes` | 200 | `noindex, follow` | `Mijn routes \| Tarnoo` |
| `/nl/feed` | 200 | `noindex, follow` | `Feed \| Tarnoo` |
| `/en/routes` | 200 | `noindex, follow` | `My routes \| Tarnoo` |

*Regression check* — pages that must stay indexable still have no robots meta:
`/nl`, `/nl/trails`, `/nl/discover`, `/nl/collections`.

*Gates*: `npm test` 31/31 · `next lint` clean · `tsc --noEmit` exit 0 ·
`npm run build` exit 0 · diff is two files.

### 2026-08-18 — P1-2 self-canonical on user profiles

*Change*: `src/app/[locale]/user/[id]/page.tsx` — added
`alternates: { canonical: '/{locale}/user/{id}' }`. Profile links are shared
often and come back carrying `?utm_*` / `?fbclid`; without a canonical each
tracking variant was a separate URL with identical content. Brings the profile
route in line with `tour/`, `trail/`, `collection/` and `highlight/`, which
already did this.

*Rendered-HTML evidence* (production build, `npm run start`):

| Request | HTTP | canonical in HTML |
|---|---|---|
| `/nl/user/b60c3f2a-…` | 200 | `…/nl/user/b60c3f2a-…` |
| `/nl/user/b60c3f2a-…?fbclid=abc123&utm_source=x` | 200 | `…/nl/user/b60c3f2a-…` (same clean URL) |

Title unchanged (`nielsbaars | Tarnoo`), no robots meta on the public profile
(still indexable — correct). The host in the local build is the Vercel-alias
fallback because `NEXT_PUBLIC_SITE_URL` is unset locally; production resolves
the same `SITE_URL` constant to `tarnoo.com`, confirmed earlier this session on
a live trail page.

*Gates*: `npm test` 31/31 · `next lint` clean · `tsc --noEmit` exit 0 ·
`npm run build` exit 0 · diff is one file.

### 2026-08-18 — P0-2 slice 4 (P0-2d): non-public tours leak no metadata

Closes P0-2 in full — all four assertions from the brief are now covered:
(a) sitemaps, (b) listing queries, (c) direct-access status, (d) metadata/JSON-LD.

*Change*: `src/lib/seo/tour-metadata.test.ts` — 4 assertions. The blocker noted
in the previous slice (page.tsx pulls in `maplibre-gl` via `TourView`) was
solved by stubbing only the heavy UI imports and `next-intl`'s request context;
`generateMetadata` itself runs for real, including its own `getTour` call.

*Evidence — mutation check*: bypassing the `if (!tour)` null-guard so a private
tour falls through to the full metadata path turned the suite **red on 3 tests**
(name leak, description/OG/Twitter, canonical), then restored (`git diff HEAD`
on `page.tsx` empty).

| Run | Result |
|---|---|
| unmutated | 31 passed / 31 (4 suites) |
| null-guard bypassed | **3 failed**, 28 passed |

*Gates*: `npm test` 31/31 · `next lint` clean · `tsc --noEmit` exit 0 ·
`npm run build` exit 0 · `git status` shows only the new test file. No
production file changed this iteration, so rendered-HTML evidence is N/A.

*Also measured this iteration, recorded as facts rather than acted on*:
- `content_rich_highlights` contains **1** row. The entire highlight-indexing
  programme (index gate + segmented sitemap) therefore yields exactly one
  indexable highlight page out of 500,875. The gate is behaving correctly —
  there is simply almost no content-rich highlight data yet. The single
  highlights sitemap segment in `robots.txt` is correct, not a bug.
- `robots.txt` lists **31** trail sitemap segments (30,265 trails ÷ 1,000),
  i.e. the `ebe4dc0` fix is holding. An earlier reading of "1 segment" in this
  session was truncated terminal output, not a regression — re-sampled 5× to
  confirm before filing anything.

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
- **P3-1: removing `changeFrequency`/`priority` from the sitemap.** Google
  ignores both fields. Removing them is churn with no measurable upside, and
  they cost nothing where they are.
- **P2-5: trimming the client i18n payload.** Filed on the assumption that the
  catalogue carried namespaces the page never uses. Measuring killed it —
  see Done, 2026-08-18. Only 14.2% is droppable, against a real runtime
  fragility. Revisit only if the catalogue grows a lot or per-route message
  splitting becomes cheap.
