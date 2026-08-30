# Master goal

**Make Tarnoo the most complete web-first outdoor route planner for Europe.**

Tarnoo should compete strongly with Komoot, but must **not blindly clone it**.
The route **planner** is the core product; everything else exists to make
planning and discovering excellent outdoor routes easier.

## What "complete" means

| Dimension | Target |
|---|---|
| **Geographic coverage** | Every European country routable, geocodable, and worth browsing — not just the Benelux/DACH core. |
| **Activity coverage** | Each supported activity gets routing tuned to how that activity actually moves. |
| **Route quality** | Sensible road/trail selection, correct surfaces, accurate elevation/climbs, no absurd detours. |
| **Official routes** | Waymarked/long-distance routes discoverable and usable as a planning base, everywhere they exist in OSM. |
| **Route intelligence** | Elevation, climbs, surface breakdown, way types, difficulty — surfaced clearly per route. |
| **Route discovery** | Trails, highlights and collections that help a user find something worth routing to. |
| **SEO** | Genuinely useful, indexable pages that satisfy real search intent and feed the planner. |
| **Localisation** | UI + content usable across Europe (today: `en` + `nl`). |
| **Planner usability** | Fast, simple, obvious — draw, adjust, export in seconds. |
| **Performance** | Sub-2s short routes; long routes complete and never silently fail. |
| **Mobile** | Fully usable on a phone browser. |
| **Interoperability** | GPX/FIT in, GPX + turn-by-turn out; loads onto Garmin/watch/apps. |

## Activities (verified in repo — `src/lib/geo.ts`)

`hike`, `run`, `touring` (cycling), `gravel`, `road` (racefiets), `ebike`, `mtb`.
`walking` maps to `hike`. Caveats: `run` reuses the hiking profile (speed model
differs client-side); `ebike` currently reuses the `trekking` profile (custom
cost function pending, GEN-104); `gravel` uses a custom `gravel-nl` profile.

## Strategic principles

- **Compete with Komoot where it creates real user value** — not feature-for-feature.
- **Do not copy a feature just because a competitor has it.** Judge against Tarnoo's strategy.
- **Prioritise route quality and European completeness** — these are the hardest to fake and the easiest to lose to.
- **Data and planner functionality feed SEO**, not the other way around. SEO pages must provide genuine user value; never thin doorway pages.
- **The route planner remains the core product.** Discovery, accounts, content and SEO support it.
- Avoid social-network complexity unless there is strong evidence it solves an important Tarnoo problem.

## Measurable success dimensions

1. **European coverage** — # countries at "functional or better" across routing + trails + highlights + discovery.
2. **Route quality** — pass rate on a routing regression/torture-test suite (see ROUTING_GAPS; not yet built).
3. **Planner performance** — p50/p95 route latency by distance band.
4. **Discovery depth** — indexable trail/region/highlight pages that pass the thin-content gate.
5. **Organic reach** — impressions/clicks on planner + discovery + landing pages (needs analytics — not yet instrumented).
6. **Interoperability** — import/export formats supported and round-trip fidelity.
