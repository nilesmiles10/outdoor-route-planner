Run **one iteration** of the European-completeness loop for Tarnoo.

One iteration = **one meaningful problem**. Do not make huge multi-feature
changes. Do not fabricate coverage.

1. **Read the strategic files** — `CLAUDE.md`, `docs/claude/EUROPE_COMPLETENESS.md`, `docs/claude/GOAL.md`, `docs/claude/ROADMAP.md`.
2. **Inspect the existing implementation** relevant to the gap (grep/read; query the DB read-only for real counts). Do not assume a feature is missing — verify.
3. **Select one meaningful European coverage gap** — prefer the highest-priority item in the scorecard/roadmap, or a newly-found one with evidence.
4. **Determine the root cause** (missing data? import gap? routing/profile? geocoding? SEO gate?). Reproduce/measure it, don't guess.
5. **Assess whether multiple countries are affected** — prefer systemic gaps over one-country fixes.
6. **Choose one high-value fix** — reusable over country-specific hacks.
7. **Implement only that fix.** For data/infra work (OSM import, Photon/BRouter), write down the exact steps rather than half-doing it.
8. **Test it** — `tsc` + `next build` if code changed; verify the coverage actually improved with a concrete before/after count or query.
9. **Add regression coverage** if appropriate (a test or a documented check).
10. **Update `docs/claude/EUROPE_COMPLETENESS.md`** — scores, notes, log entry.
11. **Update `docs/claude/ROADMAP.md`** if priorities shifted.
12. **Report** what changed, the evidence, and the next recommended gap.

Never claim a country "works" without a query or a live check behind it.
UNKNOWN is better than an invented score.
