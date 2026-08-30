# Routing Gaps — quality audit

Run with `/routing`. Engine = self-hosted **BRouter** (VPS) via
`/api/geo/route`; profiles in `src/lib/geo.ts`.

## Current routing architecture (verified)

- **Engine:** BRouter, self-hosted. Proxy `src/app/[locale]/api/geo/route/route.ts` (also `/api/geo/route`): passes `lonlats`, `profile`, `format=geojson`, `timode=2` (voicehints), `alternativeidx=0`.
- **Profiles (`SPORT_PROFILES`):** hike→`hiking-mountain`, run→`hiking-mountain`, touring→`trekking`, gravel→`gravel-nl` (**custom, NL-tuned** on the VPS), mtb→`mtb`, road→`fastbike`, ebike→`trekking` (**custom e-bike cost pending, GEN-104**).
- **Activity modes:** 7 sports. `walking`=`hike`.
- **Elevation:** per-point from BRouter geometry 3rd coordinate; full profile + `detectClimbs` (length + gradient).
- **Surface / way types:** OSM `surface` tag → paved/unpaved buckets + per-way-type breakdown from BRouter `messages` WayTags; unpaved runs marked on the map (GEN-106).
- **Climbs:** categorised with length + average gradient.
- **Access restrictions:** **static** tags only — `access=no`/`private` (and `bicycle=no`/`foot=no`) surface a warning (GEN-129). **No** conditional/seasonal handling (lookups.dat 1.7.10 limitation).
- **Turn-by-turn:** voicehints → compact turns for course export (`timode=2`, GEN-143).
- **Round trips:** `src/lib/roundtrip.ts` (`loopVias`) — target-distance loop generator; "another loop" produces variations (GEN-107).
- **Waypoints:** multi-waypoint routes fetched **per-leg** (client `legCache`), so a stale/edited leg re-routes independently.
- **Off-grid:** points off the routable graph get a straight-line leg (`straightLeg`).
- **Multi-day:** `src/lib/stages.ts` splits into day stages (per-stage stats + GPX; `stages.test.ts`).
- **Import/export:** GPX + FIT in; GPX + turn-by-turn out (`src/lib/gpx.ts`, `ExportMenu`).

### UNKNOWN (not determinable from repo)

Route-selection **quality** per country/activity; **ferries, tunnels, border
crossings, one-way/turn-restriction handling, snapping quality, private-road
avoidance beyond the static alert** — all depend on the BRouter profiles/data on
the VPS, which are **not in this repo**. **Route alternatives are not exposed**
(`alternativeidx=0`).

## Gap table

Severity: 🔴 high · 🟠 med · 🟡 low. Most quality items need reproduction first.

| Gap | Activity | Geography | User impact | Severity | Evidence | Proposed validation | Priority | Status |
|---|---|---|---|---|---|---|---|---|
| Long-route latency **+ >300km hard failure** | all (worst MTB) | all | 8–27s for 100–250km (slow but ok); **>~300km FAILS** (mislabeled "no route") | 🟠 | app-API curve (below); nginx `/geo/route` `proxy_read_timeout 60s` is the ceiling | **Decided 2026-08-29** — see "Decision" below | P2 | Decided |
| `ebike` reused `trekking` profile | ebike | all | E-bike returned a byte-identical route to touring | 🟢 | **Fixed 2026-08-29 (v1):** authored `infra/brouter/ebike.brf` (trekking base, `downhillcost` 60→20, `bikerPower` 100→250), `SPORT_PROFILES.ebike="ebike"`. Validated: no geometry regression, correct faster ETAs (Innsbruck→Seefeld 152→74 min). Route selection diverges only where a flat/hilly tradeoff exists | Field-tune v1; consider surface/road prefs later | P3 | Fixed (v1) |
| `run` reused `hiking-mountain` | run | all | Running returned a byte-identical route to hike; could route over exposed T3 scrambling | 🟢 | **Fixed 2026-08-29 (v1):** authored `infra/brouter/run.brf` (hiking-mountain base, `SAC_scale_limit` 3→2 = no exposed T3, `consider_elevation` on = runnable/flatter), `SPORT_PROFILES.run="run"`. Validated: flat identical (no regression); differs in hilly/alpine terrain, no absurd routes | Field-tune; consider surface-runnability + step penalty | P3 | Fixed (v1) |
| `gravel-nl` profile is NL-tuned | gravel | non-NL | Gravel preference may not generalise across Europe | 🟠 | `geo.ts` comment: tuned over 9 NL 40km loops | Run gravel loops in DE/ES/FR/IT; check unpaved % | P2 | Open |
| No route alternatives | all | all | User can't pick between options | 🟡 | `alternativeidx=0` | Evaluate exposing 1–3 alternatives | P3 | Open |
| Access handling is static only | all | all | Seasonal/conditional closures not reflected | 🟡 | GEN-129 comment | Assess conditional-tag support | P3 | Open |
| Ferries / borders / tunnels behaviour | cycling/hike | coastal/cross-border/islands | UNKNOWN — could produce absurd or blocked routes | 🟠 | Not surfaced in repo | Torture-test (below) before claiming pass/fail | P2 | Needs repro |
| Node-network cycling routing | touring | NL/BE/DE | — | 🟢 | **Not reproduced 2026-08-29:** NL touring routes are cycleway-dominated (Utrecht→Amersfoort 82%, Haarlem→Amsterdam 90% cycle-friendly, ~0% main road); DE similar. Routing quality is good | Closed as a routing gap — the real under-count is **discovery/data** (see EUROPE_COMPLETENESS), not routing | — | Not a routing gap |

## Routing regression test strategy

The first routing-layer suite now exists: **`src/lib/geo.test.ts`** (locks the
profile→activity invariants + the surface-bucket parsing; characterisation-tests
the ebike/run aliases so a real profile is a deliberate, test-visible change).
Extend it. Turn routing bugs into repeatable cases:

1. Each confirmed bug → a fixture: `{ from, to, sport, profile }` + the asserted
   property (e.g. "unpaved% ≥ X", "no ferry", "length within N% of straight-line
   ×1.4", "passes waypoint W", "avoids way tagged access=private").
2. Store fixtures in a `src/lib/routing/*.test.ts` suite that hits the routing
   layer (or a recorded BRouter response) and asserts on parsed stats/geometry.
3. Prefer **property assertions** over exact geometry (geometry drifts with data
   updates); pin coordinates + profile so a fix is provably systemic, not a hack.
4. Run in `npm run test`; a routing change must keep the suite green.

## European torture-test locations (scenario types — NOT graded yet)

Proposed representative scenarios for a future suite. **No pass/fail is claimed
here** — status is "untested" until run.

| Scenario type | Why it stresses routing | Status |
|---|---|---|
| Dutch cycling node network (e.g. NL city→city) | Does cycling follow the node network? | **PASS 2026-08-29** — baseline: Utrecht→Amersfoort touring 82% cycle-friendly / 0% main road; Haarlem→Amsterdam 90% / 1%. Regression = a big drop in cycle-friendly % or a rise in main-road % on these fixtures. |
| Belgian gravel loop | Gravel profile off home turf | untested |
| Alpine hut-to-hut hiking (AT/CH) | Steep terrain, path quality, elevation | untested |
| Dolomite MTB (IT) | Technical trails, big climbs/descents | untested |
| French rural road cycling (FR) | `fastbike` on quiet vs main roads | untested |
| Spanish mountain gravel (ES) | Surface data sparsity | untested |
| Scandinavian coast (NO/SE) | Ferries / water crossings | untested |
| Cross-border route (e.g. DE↔CZ, FR↔ES) | Border continuity, profile/data seams | untested |
| Islands (e.g. Greek/Balearic) | Reachability, ferries | untested |
| Dense city (Paris/Berlin) | Urban snapping, one-ways, turn restrictions | untested |
| Very long route (>300km, any) | Latency + memory | **known slow** (see gap table) |

## Top routing gaps (ranked)

1. **Long-route "no route" failure UX** (follow-up to the decision) — routes >~300km fail at the 60s ceiling and are mislabeled `no_route`; show "too long → split into stages" + guide to multi-day. (P1, cheap)
2. **`gravel-nl` generalisation** — profile tuned only for NL. (P2)
3. **Ferries/borders/islands behaviour** — UNKNOWN; reproduce before claiming. (P2)
4. **`ebike`/`run` v1 field-tuning** — profiles shipped; confirm on real rides/runs; consider surface-runnability for run. (P3)

*(Decided: long-route latency — accept BRouter, don't build GraphHopper; see Decision above, 2026-08-29.)*
*(Fixed: `ebike` + `run` aliases — authored `ebike.brf` + `run.brf` v1, 2026-08-29. All 7 activities now have distinct profiles.)*

*(Removed: "node-network cycling" — reproduced 2026-08-29 as good routing; the
under-count is a discovery/data gap, tracked in EUROPE_COMPLETENESS.)*

## Decision: long-route latency (2026-08-29)

**Evidence — real user-facing curve** (app `/api/geo/route`, touring, A'dam →):

| Distance | Time | Result |
|--:|--:|---|
| 41 km | 2.8s | ✅ |
| 134 km | 11.9s | ✅ |
| 252 km | 27.0s | ✅ |
| ~360 km | 60.2s | ❌ **422 (mislabeled "no route")** |
| ~500 km | 60.5s | ❌ **422** |

Latency is ~linear (~1s / 10 km) until it hits a **hard 60s ceiling**: nginx
`/geo/route` `proxy_read_timeout 60s`. The app's `maxDuration=120` + 110s
`AbortSignal` are **ineffective** (nginx cuts first), and the failure surfaces as
`no_route` (422) — wrong: there *is* a route, it timed out.

**Decision: DO NOT build a fast engine (GraphHopper) now. Accept BRouter + make
very-long routes an honest, guided experience.**

Why not GraphHopper:
- Day-trip routes (the overwhelming majority of outdoor planning) are 3–12s and fine with the shipped loading signpost.
- GraphHopper = a second self-hosted service + multi-GB CH preprocessing of Europe + maintenance, and it **loses BRouter's per-segment surface/elevation/waytag detail** — Tarnoo's differentiator. Running both + merging is a big project.
- **No analytics yet** → building for an unmeasured edge case is premature (roadmap DO-NOT-BUILD discipline). Revisit only if usage shows long-distance planning is common and valued.
- Product-correct answer: a 300km+ ride/hike **is** a multi-day trip — the planner already has a stage split. Guide users there instead of computing one monster route.

**Recommended follow-up fixes (cheap, honest — a separate `/routing`+`/seo`
iteration, NOT done here):**
1. Map a gateway timeout (nginx 504) to a distinct **"route too long — split it into stages"** message (i18n), not `no_route`. The client already computes straight-line distance for the long-route loading text — reuse that threshold to **warn/guide before** calculating (nudge to multi-day).
2. Do **not** just raise the 60s timeout — that only trades a fast honest failure for a 90–120s hang (worse UX). If raised at all, keep it modest and pair it with the guidance above.
3. Correct the now-misleading `maxDuration`/abort comments in `route.ts` (they imply 120s works; nginx caps at 60s).

## Available BRouter profiles (VPS `/opt/brouter/.../profiles2/`, 2026-08-29)

`trekking` (+ `-steep`/`-nosteps`/`-noferries`/`-ignore-cr`), `hiking-mountain`,
`mtb`, `gravel` + custom `gravel-nl`, `fastbike` (+ `-lowtraffic`/
`-verylowtraffic`), `shortest`, `safety`, `river`, `rail`, `skating`, `moped`,
`car-*`. **No `ebike`, `run`, or plain `hiking`/`walking` profile** → the ebike
and run gaps can't be fixed by a safe remap; they need an authored profile.

## Log

- 2026-08 — long-route `maxDuration` widened to 120s + 110s BRouter abort; map recenters to off-view routes; long-route loading state added.
- 2026-08-29 — `/routing` iteration 1: reproduced the ebike≡touring / run≡hike aliases (identical BRouter geometry); enumerated VPS profiles (no ebike/run profile); added the first routing regression suite `src/lib/geo.test.ts` (profile invariants + surface parsing). No production routing changed.
- 2026-08-29 — `/routing` iteration 2: reproduced NL/DE cycling routing → cycleway-dominated, ~0% main road (good). Closed "node-network cycling" as a routing gap; re-routed the concern to discovery/data (EUROPE_COMPLETENESS). Recorded the NL fixtures as a torture-test baseline. No code changed.
- 2026-08-29 — `/routing` iteration 3: **fixed the `ebike` alias** — authored `infra/brouter/ebike.brf` v1 (trekking base; `downhillcost` 60→20, `bikerPower` 100→250), deployed to VPS, `SPORT_PROFILES.ebike="ebike"`. Validated flat (no regression) + hilly (correct ~2× faster ETA).
- 2026-08-29 — `/routing` iteration 5: **long-route latency decision.** Measured the real curve (60s nginx `/geo/route` ceiling → routes >~300km fail, mislabeled `no_route`; app `maxDuration`/abort are ineffective). Decided: accept BRouter, do NOT build GraphHopper now; guide long routes to the multi-day split. Documented recommended cheap UX follow-up. No code changed.
- 2026-08-29 — `/routing` iteration 4: **fixed the `run` alias** — authored `infra/brouter/run.brf` v1 (hiking-mountain base; `SAC_scale_limit` 3→2, `consider_elevation` on), deployed to VPS, `SPORT_PROFILES.run="run"`. Validated flat (no regression) + hilly (avoids exposed T3, no absurd routes). **All 7 activities now have distinct profiles — no aliases left.**
