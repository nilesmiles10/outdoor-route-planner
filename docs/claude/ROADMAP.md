# Tarnoo — Roadmap

Living, high-leverage only (not a wishlist). Effort: S / M / L / XL.
Pillars: ROUTING · EUROPE · SEO · UX · DATA · COMPETITOR.

**Prioritisation score** (higher = do sooner):
`(UserValue×3) + (RoutingQuality×3) + (EuropeCoverage×2) + (SEOValue×2) + CompetitiveValue − Effort − Risk`
(each factor 1–5). Use as a tie-breaker, not gospel.

---

## NOW

**1. Instrument analytics + Search Console** · SEO/DATA · S–M
- Problem: no analytics package in the repo → SEO/UX decisions are blind.
- Why: can't prioritise or measure any of the below without it.
- Impact: high (unlocks measurement of everything). Confidence: high (verified absent).
- File: `SEO_GAPS.md`.

**2. Give `ebike` a real profile** · ROUTING · M · ✅ *done (v1, 2026-08-29)*
- Was: `ebike` reused `trekking` → byte-identical routes.
- Shipped: `infra/brouter/ebike.brf` (trekking base; `downhillcost` 60→20, `bikerPower` 100→250); correct e-bike ETAs, no route regression. Field-tuning + optional surface/road prefs remain (now P3 in `ROUTING_GAPS.md`).

**3. Validate node-network cycling** · EUROPE/ROUTING · M (validate) → L (fix)
- Problem: cycling under-counted/possibly under-routed in NL/BE/DE (node network, not `touring`).
- Why: cycling is a core activity in Tarnoo's home + biggest markets.
- Impact: high across several countries. Confidence: med (data signal; needs reproduction).
- Files: `EUROPE_COMPLETENESS.md`, `ROUTING_GAPS.md`.

**4. Decide long-route strategy** · ROUTING/UX · M
- Problem: long routes take 8–59s (measured); a loading state ships but it's slow.
- Why: multi-day/long planning feels broken; either a fast engine ("overview" mode) or clear signposting.
- Impact: med. Confidence: high (measured).
- File: `ROUTING_GAPS.md`.

## NEXT

**5. `activity × country/region` programmatic SEO pages (data-gated)** · SEO/DATA · L
- Problem: real trail data for 28 countries, but no country/region activity pages.
- Why: scalable, *honest* organic upside using the existing thin-content gate.
- Impact: high. Confidence: med (depends on per-page data density passing the gate).
- File: `SEO_GAPS.md`.

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
