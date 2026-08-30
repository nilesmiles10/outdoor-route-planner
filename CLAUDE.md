# Tarnoo — Claude project guide

Tarnoo ([tarnoo.com](https://tarnoo.com)) is a **free, no-account outdoor route
planner for the whole of Europe**. This file orients Claude in the repo and
points to the continuous-improvement system under `docs/claude/` + `.claude/`.

## Stack

- **Next.js 14** (App Router) · TypeScript · Tailwind · deployed on **Vercel** (region `fra1`).
- **i18n:** `nl` + `en` via next-intl, `[locale]` prefix, shared segment slugs (no localized pathnames).
- **Data:** Supabase (Postgres, project `ivpkstpkzbbrttkqaops`). All map/route data from **OpenStreetMap**.
- **Map:** MapLibre GL + openfreemap vector tiles.
- **Routing:** self-hosted **BRouter** (VPS `:17777`, full-Europe `.rd5` tiles) → proxied via `/api/geo/route`.
- **Geocoding:** self-hosted **Photon** (VPS `:2322`, full-Europe index) → proxied via `/api/geo/search` + `/api/geo/reverse`.
- **Activities:** `hike`, `run`, `touring`, `gravel`, `road`, `ebike`, `mtb`.

## The improvement system

`docs/claude/` holds living **gap-trackers**, one per track. `.claude/commands/`
holds the **slash commands** that run each track's continuous-improvement loop.

| Track | Gap doc | Command |
|---|---|---|
| Europe completeness | `docs/claude/EUROPE_COMPLETENESS.md` | `/europe` |
| SEO content | `docs/claude/SEO_GAPS.md` | `/seo` |
| Routing quality | `docs/claude/ROUTING_GAPS.md` | `/routing` |
| Competitor parity | `docs/claude/COMPETITOR_GAPS.md` | `/competitor` |

North star and phasing: `docs/claude/GOAL.md`, `docs/claude/ROADMAP.md`.

## Non-negotiable rules (every track)

1. **Never fabricate** product features, claims, statistics, ratings, or reviews.
   Every claim must trace to real code or observed behaviour.
2. **Verify a feature in code before writing copy or docs about it.**
3. **Reuse** existing components and patterns; prefer improving an existing URL
   over creating a thin new one. Quality over count.
4. **Validate before deploy** (`tsc --noEmit` + `next build`) and **verify on
   production** after (`tarnoo.com`, cache-bust when checking fresh renders).
5. Keep the gap doc for a track **up to date** as part of finishing any work on it.

## Related existing docs

- `docs/API.md`, `docs/SEO_AUDIT.md`, `docs/SEO_PAGE_ARCHITECTURE.md` — pre-existing references.
- `seo/SEO_BACKLOG.md` + `seo/SEO_CHANGELOG.md` — the SEO loop's detailed tracker/log (the `/seo` command and `SEO_GAPS.md` summarise from these).
