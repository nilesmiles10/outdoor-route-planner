# Tarnoo

Web-first outdoor route planner — sport-specific routing on OpenStreetMap.
A **Komoot alternative for Europe**: hiking, running, cycling, gravel, road,
e-bike and MTB, with elevation profiles, surface breakdown, climbs, GPX/FIT
import & export, round-trip generation and multi-day planning.

**Live:** https://tarnoo.com

> ### 🏷️ This project is for sale
> The whole thing is available: the codebase, the self-hosted routing +
> geocoding stack, the full-Europe OpenStreetMap data pipeline, and the
> **`tarnoo.com` domain name**.
>
> Source is public for evaluation. **Licensing or acquisition enquiries →
> [niels@intersumma.nl](mailto:niels@intersumma.nl)**

## Stack

- **Web**: Next.js 14 (App Router) + TypeScript + Tailwind, deployed on Vercel
- **i18n**: next-intl — locale routes `/en` and `/nl` from day 1
- **Map**: MapLibre GL JS + OpenFreeMap vector tiles
- **Routing**: BRouter (MIT), self-hosted — per-segment WayTags, per-point elevation
- **Geocoding**: Photon, self-hosted — full-Europe index
- **Auth/DB**: Supabase, EU region
- **Data**: OpenStreetMap (trails, highlights) via the import pipeline in `scripts/`

## Development

```bash
npm install
npm run dev   # http://localhost:3000/en or /nl
```

## Structure

- `src/app/[locale]/` — pages (all routes are locale-prefixed)
- `src/i18n/` — next-intl routing/request config
- `src/components/` — MapLibre map, planner, trail cards, …
- `messages/{en,nl}.json` — UI strings
- `scripts/` — OpenStreetMap import pipeline (trails, highlights)
- `infra/brouter/` — custom BRouter profiles
- `deploy/` — self-hosted geo-server (BRouter + Photon) setup

## Data & third-party licensing

Tarnoo builds on open data and tools, each under its own license —
**OpenStreetMap** data (ODbL), **BRouter** (MIT), **OpenFreeMap** tiles. Map
attribution is always shown and must never be removed. See [`LEGAL.md`](./LEGAL.md).
These third-party licenses are independent of the ownership of the Tarnoo code
described below.

## Ownership & license

**© 2026 Niels Baars / Intersumma. All rights reserved.**

The Tarnoo application code in this repository is **source-available, not
open-source**. It is published so it can be viewed and evaluated. It is **not**
licensed for use, reproduction, modification, or distribution — all rights are
retained by the owner. See [`LICENSE`](./LICENSE).

A commercial license, or acquisition of the project together with the
`tarnoo.com` domain, is available on request:
**[niels@intersumma.nl](mailto:niels@intersumma.nl)**.
