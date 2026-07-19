# Legal & data licensing

Decisions verified against source sites on 2026-07-19 (GEN-100).

## Map data — OpenStreetMap (ODbL)

All base map data comes from OpenStreetMap, licensed under the
[Open Database License (ODbL)](https://www.openstreetmap.org/copyright).

- **Attribution**: "© OpenStreetMap contributors" must be visible on every
  map view. Implemented via MapLibre's attribution control (never disable it).
- **Share-alike scope**: ODbL share-alike applies to *derived databases*, not
  to "produced works" (rendered maps, planned routes shown to a user). If we
  ever redistribute a database derived from OSM (e.g. an enriched POI dataset),
  that derived database must be offered under ODbL. Our own user-generated
  content (tours, highlights, photos) is not derived from OSM and stays ours.
- **OSM-seeded highlights** (Phase 3, GEN-115): highlights imported from OSM
  POIs remain ODbL-derived data — mark their provenance in the database so a
  future export can separate them from original user content.

## Tiles — OpenFreeMap (public instance)

Basemap vector tiles are served by [OpenFreeMap](https://openfreemap.org).

Verified terms (2026-07-19): commercial use allowed; no rate limits, no
registration, no API keys; required attribution
"OpenFreeMap © OpenMapTiles Data from OpenStreetMap" (MapLibre adds this
automatically from the style); fully open source and self-hostable; weekly
full-planet downloads in MBTiles format; **no SLA**.

- **MVP stance**: use the public instance.
- **Scale/offline stance**: when traffic grows or Phase 6 needs offline
  region downloads, self-host tiles from OpenFreeMap's weekly MBTiles planet
  on our own infra. No ToS obstacle to offline caching — the project itself
  distributes the tile database.

## Routing — BRouter + brouter.de segments

BRouter is MIT-licensed. Routing segment files (rd5) are derived from OSM
(ODbL) and downloaded from brouter.de; we refresh them nightly. Route
responses shown to users are produced works.

## Elevation

Per-point elevation comes from BRouter (derived from open DEMs). Terrain/
hillshade tiles for the map (GEN-101/123) must use an open DEM source
(e.g. Copernicus GLO-30 — free use with source acknowledgement).

## House rules

1. Never remove or hide map attribution.
2. Track provenance (`source` column) on any table seeded from OSM data.
3. Re-verify provider terms before shipping paid features that depend on them.
