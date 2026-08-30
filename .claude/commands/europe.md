Continuously improve **Europe completeness** for Tarnoo — make routing,
geocoding, trails and highlights work well everywhere in Europe, not just the
core markets.

Read `docs/claude/EUROPE_COMPLETENESS.md` first (and `CLAUDE.md` for stack). Then
loop:

1. **Audit** — pick one open/🔍 item from the gap doc, or discover a new one.
   Measure it for real: query Supabase (`trails`/`highlights` per country),
   hit `/api/geo/search` + `/api/geo/route` for the region, or check the live
   site. Don't assume — count.
2. **Diagnose** the root cause (missing data? import gap? routing edge case?
   geocoding quality?). Reproduce the symptom before proposing a fix.
3. **Fix** the highest-impact gap, reusing existing import/data patterns. If it's
   a data/infra job (OSM re-import, Photon/BRouter), note the exact steps.
4. **Validate** — `tsc` + `next build` if code changed; verify the coverage
   actually improved with a concrete before/after count or query.
5. **Update `docs/claude/EUROPE_COMPLETENESS.md`** (status + log entry), then
   continue to the next gap.

Rules: never fabricate coverage — a claim of "works in country X" needs a query
or a live check behind it. Prefer measuring and filling real gaps over cosmetic
changes.
