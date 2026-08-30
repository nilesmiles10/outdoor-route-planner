# Routing Gaps — tracker

Goal: routes are correct, sensible per activity, and fast enough. Run with
`/routing`. Routing = BRouter (VPS `:17777`) proxied by `/api/geo/route`;
profiles in `src/lib/geo.ts` (`SPORT_PROFILES`).

## Known issues

| Issue | Status | Notes |
|---|---|---|
| Long-route latency | ⚠️ open | BRouter is CPU-bound on route length: ~250 km ≈ 8s, ~460 km ≈ 30s, a 250 km **MTB** route ≈ 59s. Measured cold≈warm, so it's compute, not tile-cache. Not a config bug. |
| Function timeout | ✅ mitigated | `maxDuration` on `/api/geo/route` raised to 120s + a 110s BRouter abort — long routes complete instead of being cut off. |
| Map didn't recenter to new routes | ✅ fixed | `MapView` only fitted the first route (`hasFitRef`); now also refits when a new route is fully off-view. Was the real cause of "foreign route does nothing". |
| Per-activity profiles | ✅ | touring/gravel/road/ebike/hike/run/mtb each map to a BRouter profile. Verified they return distinct routes. |

## To consider / audit

- 🔍 **Fast engine for long routes** — GraphHopper (contraction hierarchies)
  would make 250–500 km routes near-instant, as a "fast/overview" mode alongside
  BRouter's detailed mode. Bigger infra project; only if long-distance planning
  becomes a headline use case. **Held.**
- 🔍 **MTB profile cost** — ~59s for a long MTB route is an outlier vs touring
  (~8s). Worth profiling whether the MTB cost function can be trimmed.
- 🔍 **UX for slow routes** — a long-route "this can take a moment" loading state
  ships; confirm it reads well and consider a soft warn / split-suggestion on
  very long routes.
- 🔍 **Surface/elevation accuracy** — spot-check that surface breakdown and
  elevation match reality on a sample of routes per country.

## Log

- 2026-08 — map-recenter fix; `maxDuration` 60→120 + BRouter abort; long-route
  loading state.
