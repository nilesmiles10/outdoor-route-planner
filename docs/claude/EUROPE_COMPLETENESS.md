# Europe Completeness — gap tracker

Goal: routing, geocoding, trails and highlights work well **everywhere in
Europe**, not just the core markets. Run with `/europe`.

Status: ✅ good · ⚠️ partial/uneven · ❌ gap · 🔍 needs audit

## Coverage by capability

| Capability | Source | Status | Notes |
|---|---|---|---|
| Geocoding (search + reverse) | Photon, self-hosted VPS `:2322` | ✅ | Full-Europe index (~78M docs) live since 2026-08-22; replaced NL+BE-only. Verified Zermatt/Chamonix/München/Innsbruck/Bolzano resolve correctly. |
| Routing tiles | BRouter, VPS `:17777` | ✅ | Full-Europe `.rd5` set present (W25→E30 / N35→N70). Short routes <2s everywhere tested (NL/CH/IT/DE). |
| Waymarked trails | OSM import → `trails` (~30k) | ⚠️ | Present across Europe but **density is uneven** (NL well-covered; some countries sparse). Filterable by country/region at `/trails`. |
| Highlights (POIs) | OSM import → `highlights` (~500k) | ⚠️ | Broad but thin ones are noindex; density varies by region. |
| Difficulty / surface / elevation | computed per route | ✅ | Works anywhere a route can be built. |

## Known gaps / to audit

- 🔍 **Per-country trail density** — quantify how many trails per country; flag
  countries that look empty to a user browsing `/trails`.
- 🔍 **Geocoding quality edge cases** — non-Latin scripts, small hamlets, POI
  names vs street names in each country.
- 🔍 **Cross-listing / duplicate places** — verify Photon full-Europe didn't
  reintroduce ambiguous-name collisions.
- 🔍 **Long-route routing across borders** — works, but slow (see `ROUTING_GAPS.md`).

## Log

- 2026-08-22 — Photon full-Europe index deployed (was NL+BE). Backup retained.
- (add entries as coverage is audited/filled)
