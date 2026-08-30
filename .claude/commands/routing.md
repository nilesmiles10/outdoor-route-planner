Run **one iteration** of the routing-quality loop for Tarnoo.

**Guiding principle: fix the routing system, not just the example route.**

1. **Select one routing-quality problem or test scenario** — from `docs/claude/ROUTING_GAPS.md` (gap table or torture-test list), or a newly reported bad route.
2. **Reproduce the issue where possible** — hit `/api/geo/route` (or BRouter directly) with concrete `from`/`to`/`sport`; inspect geometry, stats, surface, elevation. Measure; don't guess. Separate engine behaviour from app/UX/timeout layers.
3. **Understand the root cause** before changing anything (profile? proxy/API? client? data on the VPS?).
4. **Avoid one-off coordinate hacks** — a fix that only helps one lat/lon is not a fix.
5. **Determine whether the issue affects multiple countries/activities** — prefer systemic fixes.
6. **Implement the smallest systemic fix.**
7. **Compare before/after behaviour** with the same reproduction (time, surface %, corrected geometry).
8. **Add a regression test** — a fixture `{from,to,sport}` + a property assertion (see the regression strategy in `ROUTING_GAPS.md`). There are no routing tests yet; start the suite if needed.
9. **Update `docs/claude/ROUTING_GAPS.md`** (gap status, torture-test result, log).
10. **Update `docs/claude/EUROPE_COMPLETENESS.md`** if the fix changes a country/activity score.
11. **Report** remaining risks and the next recommended scenario.

Note: BRouter profiles/data live on the VPS, not in this repo. Verify actual
BRouter behaviour empirically before writing a fix — never fix routing from
memory. Confirm a change didn't regress other activities/regions.
