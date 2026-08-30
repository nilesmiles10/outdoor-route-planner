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
| Long-route latency | all (worst MTB) | all | Long routes take 8–59s; feel broken | 🟠 | Measured: 250km≈8s, 460km≈30s, 250km MTB≈59s; cold≈warm | Time a distance×profile matrix; decide on a fast engine (GraphHopper) for a "fast/overview" mode | P1 | Open |
| `ebike` reuses `trekking` profile | ebike | all | E-bike returns a **byte-identical route to touring** | 🟠 | **Reproduced 2026-08-29:** ebike & touring both → `trekking`, identical geometry (Bolzano→Merano). No e-bike profile exists on the VPS | Fix = authored+tuned `ebike.brf` (GEN-104); no safe existing remap | P1 | Reproduced |
| `run` reuses `hiking-mountain` | run | all | Running returns a **byte-identical route to hike**; over-prefers rough mountain paths | 🟡 | **Reproduced 2026-08-29:** run & hike both → `hiking-mountain`, identical geometry. Only foot profile on the VPS is `hiking-mountain` | Fix = road-lean foot profile (authored); no safe existing remap | P2 | Reproduced |
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

1. **`ebike` has no real profile** — reuses trekking (identical routes); clear user-facing wrongness. (P1)
2. **Long-route latency** — real, measured; decide fast-engine vs accept + signpost. (P1)
3. **`gravel-nl` generalisation** — profile tuned only for NL. (P2)
4. **Ferries/borders/islands behaviour** — UNKNOWN; reproduce before claiming. (P2)
5. **`run` has no real profile** — reuses hiking-mountain; over-prefers mountain paths. (P2)

*(Removed: "node-network cycling" — reproduced 2026-08-29 as good routing; the
under-count is a discovery/data gap, tracked in EUROPE_COMPLETENESS.)*

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
