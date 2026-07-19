# Outdoor Route Planner

Web-first outdoor route planner (working title) — sport-specific routing on
OpenStreetMap. Komoot competitor; plan and backlog live in Linear project
*"Outdoor Route Planner — Komoot rival"* (GEN-98…139).

## Stack

- **Web**: Next.js 14 (App Router) + TypeScript + Tailwind, deployed on Vercel
- **i18n**: next-intl — locale routes `/en` and `/nl` from day 1
- **Map**: MapLibre GL JS + OpenFreeMap vector tiles (style choice = GEN-100)
- **Routing**: BRouter self-hosted on the VPS (decided empirically in GEN-98 —
  per-segment WayTags, per-point elevation, ~156 MB RAM)
- **Auth/DB** (Phase 2): Supabase, EU region

## Development

```bash
npm install
npm run dev   # http://localhost:3000/en or /nl
```

## Structure

- `src/app/[locale]/` — pages (all routes are locale-prefixed)
- `src/i18n/` — next-intl routing/request config
- `src/components/MapView.tsx` — MapLibre basemap
- `messages/{en,nl}.json` — UI strings

## Phases

0. Foundation (routing engine ✅, scaffold ✅, tiles/geocoding)
1. Core planner — waypoints, sport profiles, elevation, surfaces, GPX
2. Accounts & saved tours (Supabase)
3. Discover & content (SEO)
4. Community & recording
5. Premium (radical free-first pricing) & B2B
6. Mobile app (Expo) — final phase
