# Competitor Gaps — analysis framework

Run with `/competitor`. **Primary competitor: Komoot.** Secondary: Strava
Routes, RideWithGPS, AllTrails, Outdooractive, Wikiloc, Mapy.com.

> **Integrity rule.** Everything in the "Tarnoo" column is **VERIFIED FROM THE
> REPOSITORY**. Every competitor claim is **REQUIRES EXTERNAL RESEARCH** until
> confirmed with a current, dated source. Never assert a competitor's pricing or
> features from memory — it goes stale and becomes a fabrication.

## Capability matrix

`P0` a route planner fundamentally needs this · `P1` major competitive
opportunity · `P2` useful enhancement · `P3` not worth copying by default.

| Capability | Tarnoo (verified from repo) | Priority | Competitors |
|---|---|---|---|
| Route creation (draw + waypoints) | ✅ draw, drag, waypoints, per-leg re-route | P0 | EXTERNAL RESEARCH |
| Activity profiles | ✅ 7 (hike/run/touring/gravel/road/ebike/mtb); run & ebike reuse profiles | P0 | EXTERNAL RESEARCH |
| Routing preferences/weighting | ✅ per-profile (BRouter); no user-facing tuning | P1 | EXTERNAL RESEARCH |
| Round trips | ✅ target-distance loop generator + variations | P1 | EXTERNAL RESEARCH |
| Route alternatives | ❌ single route (`alternativeidx=0`) | P2 | EXTERNAL RESEARCH |
| Elevation | ✅ profile + total asc/desc | P0 | EXTERNAL RESEARCH |
| Surfaces | ✅ paved/unpaved breakdown + map marking | P1 | EXTERNAL RESEARCH |
| Way types | ✅ per-way-type breakdown | P2 | EXTERNAL RESEARCH |
| Climbs | ✅ categorised (length + gradient) | P1 | EXTERNAL RESEARCH |
| Trail difficulty | ⚠️ difficulty rating exists; no S0–S5/SAC technical grade | P2 | EXTERNAL RESEARCH |
| Official routes | ✅ ~30k OSM waymarked routes, browsable/filterable | P1 | EXTERNAL RESEARCH |
| Discovery | ✅ `/trails`, `/discover` (region×category), collections | P1 | EXTERNAL RESEARCH |
| Highlights / POIs | ✅ ~500k OSM highlights; content-rich ones indexed | P1 | EXTERNAL RESEARCH |
| Photos | ⚠️ `highlight_photos` table exists; scale UNKNOWN | P2 | EXTERNAL RESEARCH |
| Weather | ✅ start-location weather (`/api/weather`) | P2 | EXTERNAL RESEARCH |
| Offline usage | ❌ web app; no offline claimed | P2 | EXTERNAL RESEARCH |
| Navigation (live turn-by-turn) | ⚠️ turn-by-turn **course export** only; no in-app live nav | P2 | EXTERNAL RESEARCH |
| Device integrations | ⚠️ via GPX/FIT files (Garmin/watch); no direct sync | P2 | EXTERNAL RESEARCH |
| Route import | ✅ GPX + FIT | P1 | EXTERNAL RESEARCH |
| Route export | ✅ GPX + turn-by-turn course | P0 | EXTERNAL RESEARCH |
| Collections | ✅ collections + bookmarks | P2 | EXTERNAL RESEARCH |
| Multi-day planning | ✅ stage split (per-stage stats + GPX) | P1 | EXTERNAL RESEARCH |
| Search / filtering | ✅ activity/country/region/distance/difficulty on `/trails`, `/discover` | P1 | EXTERNAL RESEARCH |
| Localisation | ⚠️ en + nl only | P2 | EXTERNAL RESEARCH |
| Mobile experience | ⚠️ responsive web (verify per-page); no native app (Expo = later phase) | P1 | EXTERNAL RESEARCH |
| Community / social | ❌ not built (recording/community = later phase per README) | P3 | EXTERNAL RESEARCH |
| SEO / discoverability | ✅ strong (sitemaps, structured data, landing cluster) | P1 | EXTERNAL RESEARCH |

## Tarnoo differentiators (verified, to lean into)

- **Free and no account** to plan and export.
- **All-Europe** from one planner (OSM), full-Europe routing + geocoding.
- **Route intelligence surfaced clearly:** elevation + climbs + surface + way types on every route.
- **Interoperability:** GPX **and** FIT import; GPX + turn-by-turn export.
- **Web-first speed + SEO** as an acquisition engine.

## Requires external competitor research (do before any comparison copy)

For **each** competitor, confirm with a current source: pricing/free-tier limits;
number of activity profiles; whether round trips / alternatives exist; surface &
way-type detail; offline maps; live navigation; device sync; region/country
coverage model; whether planning is free without an app. **Log the date.**
Until then, competitor cells stay `EXTERNAL RESEARCH`.

## Do not blindly copy

- **Community / social feeds, following, activity sharing** — a *later* phase at
  most, and only if it demonstrably improves route discovery. Not a route-planner
  fundamental; easy to over-invest in. (P3 by default.)
- **Live in-app navigation / offline maps** — large scope; Tarnoo's export-to-
  device path may serve the need. Build only with evidence of demand. (P2.)
- **Photo/UGC at scale, leaderboards, segments** — competitor strengths that
  don't obviously advance "plan and discover excellent routes." Judge against
  strategy, not parity.
- **Paywalling regions** (a known competitor model) — contradicts Tarnoo's
  free/all-Europe positioning. Do not copy.

The objective is **not feature parity** — it's that Tarnoo users plan and
discover excellent outdoor routes more effectively.

## Blocked

- **"Komoot alternative" SEO page** (SEO_GAPS P2) — blocked here until Komoot's
  current model is verified enough for a factual, dated comparison.

## Log

- (add entries as competitor facts are verified, with dates + sources)
