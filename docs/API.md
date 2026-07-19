# API contract (GEN-112)

The app deliberately has **two API surfaces**, both token-based and free of
web-only assumptions, so the Phase-6 mobile app (Expo) reuses them unchanged.

## 1. Data: Supabase PostgREST (`/rest/v1/*`)

Base: `https://ivpkstpkzbbrttkqaops.supabase.co/rest/v1/`
Auth: `apikey: <publishable key>` + (when logged in) `Authorization: Bearer <access_token>`.
Login: email OTP — `auth.signInWithOtp({email})` → `auth.verifyOtp({email, token, type:'email'})`.
Works identically in supabase-js on web and React Native; RLS is the
authorization layer (verified: anon sees only `visibility='public'` tours,
owners see/write their own — see GEN-109 RLS test).

Tables (see migration `init_profiles_tours_saved_places`):
- `profiles` — 1:1 with auth user, auto-created on signup
- `tours` — denormalized route document (waypoints, geometry LineString,
  elevation[], stats, surfaces, waytypes, visibility, custom_speed_kmh)
- `saved_places` — home/work/place favorites

### Incremental sync (mobile, Phase 6)

Every table has `updated_at` (touch-triggered) + `(owner, updated_at desc)`
index. Pull-based sync:

```
GET /rest/v1/tours?select=*&updated_at=gt.<last_cursor>&order=updated_at.asc
```

Verified working with a plain curl (no SDK, no cookies) on 2026-07-19.
Deletes: not tombstoned yet — mobile sync engine (GEN-124) should either
full-resync ids periodically or we add a `deleted_at` tombstone column then.

## 2. Geo: Next.js route handlers (`/api/geo/*`)

Base: `https://outdoor-route-planner-seven.vercel.app/api/geo/`
Stateless GETs, no auth (rate limiting TBD before public launch):

- `GET /api/geo/search?q=<text>[&lat=&lon=]` → `{results:[{name,label,type,lon,lat}]}`
- `GET /api/geo/reverse?lon=&lat=` → `{name}`
- `GET /api/geo/route?points=lon,lat|lon,lat[…max 10]&sport=<hike|run|touring|gravel|mtb|road|ebike>`
  → `{geometry, stats:{distanceM,timeS,ascendM,descendM}, surfaces:{buckets,detailM}, waytypes, elevation[]}`
  Errors: 400 `bad_request`, 422 `no_route`, 503 `router_unavailable`.

These proxy the VPS geo-services (BRouter/Photon behind
`novactrl.nl/geo/*` + `X-Geo-Key`); clients never talk to the VPS directly.

## Versioning stance

- PostgREST: schema changes go through migrations; breaking changes require
  a compatibility view or new column, never repurposing.
- `/api/geo/*`: current shape is v1-implicit. If a breaking change is ever
  needed, add `/api/geo/v2/*` alongside — never mutate response shapes in place.
