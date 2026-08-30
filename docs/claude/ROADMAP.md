# Tarnoo — Roadmap

Living, high-leverage only (not a wishlist). Effort: S / M / L / XL.
Pillars: ROUTING · EUROPE · SEO · UX · DATA · COMPETITOR.

**Prioritisation score** (higher = do sooner):
`(UserValue×3) + (RoutingQuality×3) + (EuropeCoverage×2) + (SEOValue×2) + CompetitiveValue − Effort − Risk`
(each factor 1–5). Use as a tie-breaker, not gospel.

---

## NOW

**1. Instrument analytics + Search Console** · SEO/DATA · S–M · ✅ *code done 2026-08-29*
- Shipped: Vercel Web Analytics + Speed Insights in the root layout (cookieless), verified live.
- Remaining (manual, not code): enable both products in the Vercel dashboard; connect Google Search Console + submit the sitemap (verification already wired via `site_settings.google_site_verification`). See `SEO_GAPS.md` → Measurement setup.
- Impact: high (unlocks measurement of everything else).

**2. Give `ebike` a real profile** · ROUTING · M · ✅ *done (v1, 2026-08-29)*
- Was: `ebike` reused `trekking` → byte-identical routes.
- Shipped: `infra/brouter/ebike.brf` (trekking base; `downhillcost` 60→20, `bikerPower` 100→250); correct e-bike ETAs, no route regression. Field-tuning + optional surface/road prefs remain (now P3 in `ROUTING_GAPS.md`).

**3. Validate node-network cycling** · EUROPE/ROUTING · M (validate) → L (fix)
- Problem: cycling under-counted/possibly under-routed in NL/BE/DE (node network, not `touring`).
- Why: cycling is a core activity in Tarnoo's home + biggest markets.
- Impact: high across several countries. Confidence: med (data signal; needs reproduction).
- Files: `EUROPE_COMPLETENESS.md`, `ROUTING_GAPS.md`.

**4. Long-route strategy** · ROUTING/UX · ✅ *decided 2026-08-29* → S follow-up
- Decided: **accept BRouter, don't build GraphHopper** (day-trips are fine; GraphHopper is heavy + loses per-segment detail; no analytics to justify it). See `ROUTING_GAPS.md` → Decision.
- Found: routes >~300km **fail** at the nginx 60s ceiling, mislabeled `no_route`.
- Follow-up ✅ *done 2026-08-29*: gateway 504 → `route_too_long` message ("add a waypoint or make it shorter"), verified live; misleading `route.ts` comments corrected. Optional remainder: a proactive pre-calculation warning (P3).

## NEXT

**5. `activity × country` programmatic SEO pages (data-gated)** · SEO/DATA · L · ✅ *done 2026-08-29*
- Shipped: `/[locale]/explore/[activity]/[country]` (64 combos) **and** `/[locale]/explore/[activity]/[country]/[region]` (~295 combos), gated at ≥25 real routes, × 2 locales, real route lists + ItemList schema + dense internal-link mesh (country↔region↔activity). Verified live (below-gate combos 404). Self-updating from the DB.

**6. Routing regression/torture-test suite** · ROUTING/UX · M · *started*
- Problem: zero routing tests; quality is asserted, not measured.
- Why: makes every future routing fix systemic + safe.
- Impact: med (compounding). Confidence: high.
- Status: first suite landed (`src/lib/geo.test.ts` — profile invariants + surface parsing, 2026-08-29). Extend to the torture-test scenarios.
- File: `ROUTING_GAPS.md`.

**7. Assess `gravel-nl` profile across Europe** · ROUTING · M
- Problem: gravel profile tuned only on NL loops.
- Why: gravel is a differentiator; must generalise.
- Impact: med. Confidence: high (verified NL-only tuning).
- Files: `ROUTING_GAPS.md`, `EUROPE_COMPLETENESS.md`.

**8. Richer highlight pages via existing AI descriptions** · SEO/DATA · M
- Problem: most highlights thin/noindex; AI-description pipeline already exists.
- Why: raises the content-rich count → more honestly-indexable pages.
- Impact: med. Confidence: med.
- File: `SEO_GAPS.md`.

## LATER

**9. European footprint decision + imports for zero-coverage countries** · EUROPE/DATA · L
- Problem: Balkans-ex-HR/SI, IS, CY, MT, Baltics-thin, GR-trails ≈ 0.
- Why: "most complete for Europe" implies a deliberate footprint.
- Impact: med. Confidence: high (verified gaps). File: `EUROPE_COMPLETENESS.md`.

**10. More UI locales** · UX/EUROPE · L
- Problem: UI only en/nl. Why: non-Benelux users get English. Confidence: high.

**11. Route alternatives** · ROUTING · M
- Problem: single route only (`alternativeidx=0`). Why: user choice. Confidence: high.

**12. "Komoot alternative" comparison page** · SEO/COMPETITOR · M
- Blocked on verified competitor facts. File: `COMPETITOR_GAPS.md`.

## DO NOT BUILD (now)

- **Community/social feed, following, activity sharing** — later phase at most; not a planner fundamental; easy to over-invest in. (`COMPETITOR_GAPS.md`)
- **Live in-app navigation / offline maps** — large scope; export-to-device may already serve the need. Build only with demand evidence.
- **Thin AI-generated doorway pages / `activity × country` pages below the data gate** — actively harmful to SEO.
- **Region paywalling** — contradicts Tarnoo's free/all-Europe positioning.
- **Route-quality claims without a regression test behind them.**
