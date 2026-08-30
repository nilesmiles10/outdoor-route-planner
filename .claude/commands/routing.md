Continuously improve Tarnoo's **routing quality** — correct, sensible-per-
activity, accurate, and fast enough routes.

Read `docs/claude/ROUTING_GAPS.md` first (and `CLAUDE.md`). Routing = BRouter
(VPS `:17777`) via `/api/geo/route`; profiles in `src/lib/geo.ts`. Then loop:

1. **Pick** an open/🔍 item from the gap doc, or find a new one (a bad route, a
   wrong surface, a slow response, a profile that misbehaves).
2. **Reproduce it for real** — hit `/api/geo/route` (or BRouter directly) with
   concrete coordinates, time it, inspect the geometry/stats. Measure, don't
   guess. Distinguish routing-engine behaviour from app/UX/timeout layers.
3. **Diagnose** the root cause before changing anything.
4. **Fix** at the right layer (profile, proxy/API, client UX, or infra). For
   engine/infra changes, note exact steps and trade-offs (e.g. a fast engine
   loses BRouter's per-segment detail).
5. **Validate** — `tsc` + `next build` if code changed; re-run the same
   reproduction and show the before/after (time, or corrected route).
6. **Update `docs/claude/ROUTING_GAPS.md`** (status + log), then continue.

Rules: verify the actual BRouter/library behaviour empirically before writing a
fix (no fixing from memory). Don't claim a routing capability the engine doesn't
have. Paper-trading-style safety doesn't apply here, but always confirm a change
didn't regress other activities/regions.
