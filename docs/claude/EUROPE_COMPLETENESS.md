# Europe Completeness — coverage scorecard

Living scorecard for European coverage. Run with `/europe`. **Scores below are
grounded in repository + live-DB evidence where noted; everything else is
UNKNOWN and listed under "Validation needed."**

## Scoring (0–5)

`0` unsupported · `1` severely incomplete · `2` significant gaps · `3`
functional · `4` strong · `5` excellent / comprehensive · `UNKNOWN` = not
determinable without production testing/data.

## Cross-country dimensions (uniform — infrastructure level)

These are the same everywhere by construction; **per-country quality is UNKNOWN
without testing** (see Validation needed).

| Dimension | Score | Evidence |
|---|---|---|
| **Base routing (engine reach)** | 4 | BRouter self-hosted with a **full-Europe `.rd5` tile set**; short routes return <2s in every country tested (NL/DE/FR/CH/IT). Per-country *quality* untested → cap at 4. |
| **Geocoding** | 4 | Photon **full-Europe index** (~78M docs). Bug-cases (Zermatt/Chamonix/München/Innsbruck/Bolzano) verified. Small-place/non-Latin quality UNKNOWN. |
| **Elevation** | 4 | Per-point elevation from BRouter geometry (3rd coord), full profile + climbs. Uniform Europe-wide. |
| **Surface / way data** | 3 | OSM `surface` → paved/unpaved buckets; depends on OSM tag completeness, which varies by country (UNKNOWN per country). |
| **Localisation (UI)** | 2 | App UI is `en` + `nl` only. Usable Europe-wide but not localized beyond two languages; place names come from OSM (local). |
| **QA confidence** | 1 | No routing regression tests exist; no per-country QA. Only SEO-guard + stages unit tests. |

## Per-country data coverage (from live DB, 2026-08-29)

Trail = rows in `trails`; Highlights = rows in `highlights`. Scores are a
**data-density proxy** for hiking / cycling / MTB / gravel / discovery — they do
**not** measure routing quality (UNKNOWN, needs testing). Cycling score uses
OSM `touring` route tags and **understates node-network countries (esp. NL/BE)**.

| Country | Trails | Hike | Cyc | MTB | Grav | Highlights | Disc | Notes |
|---|--:|:--:|:--:|:--:|:--:|--:|:--:|---|
| DE | 4529 | 5 | 5 | 4 | 5 | 75809 | 5 | Best all-round. Only country with real gravel data. |
| NL | 4369 | 5 | 2 | 3 | 1 | 2994 | 2 | Hiking-heavy; cycling under-counted (node network, not `touring`); few highlights. Historical home market. |
| ES | 3810 | 5 | 4 | 4 | 1 | 62085 | 5 | Strong hiking + huge highlight base. |
| FR | 3505 | 3 | 5 | 5 | 3 | 51804 | 5 | Cycling/MTB-led; hiking under-represented vs size. |
| AT | 2561 | 4 | 3 | 5 | 2 | 20656 | 4 | Alpine MTB/hiking strong. |
| IT | 2530 | 4 | 3 | 5 | 3 | 54947 | 5 | Dolomite MTB + dense highlights. |
| PL | 1947 | 3 | 4 | 3 | 4 | 20498 | 4 | Surprisingly strong gravel/cycling. |
| CZ | 1469 | 4 | 2 | 2 | 1 | 17999 | 4 | Hiking-led. |
| SE | 1042 | 3 | 2 | 3 | 2 | 21899 | 4 | |
| CH | 817 | 3 | 2 | 3 | 1 | 10297 | 3 | Fewer trails than Alpine peers; highlights ok. |
| GB | 647 | 2 | 3 | 3 | 2 | 27776 | 4 | Trails thin vs population/highlights. |
| HU | 566 | 3 | 1 | 2 | 1 | 7957 | 3 | |
| BE | 553 | 2 | 3 | 3 | 1 | 3762 | 2 | Cycling under-counted (node network). |
| DK | 252 | 1 | 2 | 2 | 2 | 2112 | 2 | |
| SI | 251 | 2 | 1 | 1 | 1 | 8801 | 3 | |
| SK | 218 | 1 | 1 | 2 | 1 | 11439 | 3 | |
| NO | 191 | 2 | 1 | 1 | 1 | 21735 | 4 | Highlights strong, trails thin. |
| HR | 164 | 1 | 2 | 2 | 2 | 11398 | 3 | |
| PT | 157 | 1 | 1 | 1 | 0 | 6158 | 3 | |
| LV | 134 | 1 | 2 | 1 | 2 | 1047 | 2 | |
| EE | 112 | 1 | 1 | 0 | 1 | 896 | 1 | |
| FI | 102 | 1 | 1 | 1 | 1 | 11442 | 3 | Trails very thin vs size. |
| RO | 88 | 1 | 1 | 1 | 1 | 8509 | 3 | |
| IE | 87 | 1 | 1 | 1 | 1 | 5993 | 3 | |
| BG | 57 | 1 | 1 | 1 | 0 | 6450 | 3 | |
| LU | 50 | 1 | 1 | 1 | 0 | 567 | 1 | |
| LT | 44 | 1 | 1 | 1 | 1 | 1025 | 2 | |
| GR | 13 | 1 | 1 | 0 | 0 | 7797 | 3 | Trails almost absent; highlights ok. |

**Not imported (0 trails, 0 highlights in DB):** e.g. IS, non-EU Balkans
(RS, BA, ME, MK, AL, XK), CY, MT, LI, AD, and Eastern-Europe non-members
(UA, BY, MD, RU). Treat as **score 0 / not yet covered** until an import runs.
(~17k highlights have a null country — geocoding-of-import gap.)

## Cross-Europe gaps

- **Cycling under-representation in node-network countries** (NL, BE, parts of DE): OSM tags city-to-city cycling as node networks, not `touring` relations, so trail counts and cycling *discovery* understate real coverage. **This is a discovery/data gap, NOT a routing gap** — verified 2026-08-29 that NL cycling *routing* is cycleway-dominated (~0% main road; see ROUTING_GAPS). The fix is on the import/discovery side (surface node-network routes in `/trails`/`/discover`), not the routing profile.
- **Gravel data is sparse everywhere except DE/PL/FR** — gravel is not a native OSM route type (derived `is_gravel` flag on `touring`). Discovery of gravel routes is weak Europe-wide.
- **Trail density ≪ highlight density** in many countries (GB, NO, FI, GR, SK): plenty to *discover*, little *official-route* material to plan from.
- **~17k null-country highlights** — an import/geocoding gap that hurts region grouping and SEO combos.
- **UI localisation is only en/nl** — every non-Benelux user gets English UI.
- **No routing QA per country** — quality is asserted, not measured.

## Highest-priority coverage gaps (by evidence)

1. **Node-network cycling discovery** — biggest systemic under-count; fixing it lifts cycling coverage/discovery across NL/BE/DE at once. **Confirmed a data/discovery gap** (routing is fine — verified 2026-08-29): the fix is importing/surfacing node-network cycle routes in `/trails`+`/discover`, not touching the routing profile.
2. **Long-tail countries with rich highlights but ~no trails** (GR, FI, NO, GB, RO, BG): discovery works, planning-from-official-routes doesn't. Decide whether to import more OSM routes there.
3. **Zero-coverage countries** (Balkans ex-HR/SI, IS, CY, MT, Baltics-thin): decide the intended European footprint and run imports accordingly.
4. **Gravel discovery** — thin outside DE; the `gravel-nl` profile is NL-tuned (see ROUTING_GAPS) — unclear it generalises.

## Validation needed (requires production data / testing, not in repo)

- Actual **routing quality per country** (torture tests — see ROUTING_GAPS).
- Does the **cycling under-count** reflect missing planning capability, or just discovery counts?
- **Which trail/region/highlight pages actually pass the thin-content gate** per country (affects SEO coverage — cross-ref SEO_GAPS).
- **OSM surface-tag completeness** per country (affects the surface score).
- Is the **`gravel-nl` profile** acceptable outside NL?
- Target **European footprint**: which currently-zero countries are in scope?

## Log

- 2026-08-22 — Photon full-Europe geocoding live (was NL+BE).
- 2026-08-29 — scorecard seeded from live DB trail/highlight counts.
