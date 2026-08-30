# Tarnoo — Roadmap

Loose, living. Each track advances via its own loop (`/europe`, `/seo`,
`/routing`, `/competitor`); this file is the cross-track view of what's done and
what's next. Update as phases complete.

## Done (foundation)

- Planner (all activities), `/trails`, `/discover`, `/collections`, detail pages,
  auth, tours, highlights, GPX import/export, round-trip, multi-day stage split.
- **Full-Europe geocoding** (Photon, ~78M docs) replacing NL+BE-only.
- **Full-Europe routing** (BRouter, complete `.rd5` tile set).
- **SEO cluster:** 7 use-case landing pages (hike/cycle/MTB/run/GPX/multi-day/
  loop) × nl+en, sitewide footer nav, intro+FAQ on `/trails` and `/discover`.
- Routing fixes: map recenters to off-view routes; function timeout widened for
  long routes.

## Next (by track — see each gap doc for detail)

- **Europe:** audit per-country coverage (trail density, geocoding quality,
  routing edge cases); surface and fill the weakest regions.
- **Routing:** decide whether long-route latency (BRouter 8–59s) warrants a fast
  engine (GraphHopper) for a "fast/overview" mode; profile tuning.
- **SEO:** per-page OG images; region-page intros; evaluate homepage H1; Komoot
  comparison (only once competitor facts are verifiable).
- **Competitor:** structured parity assessment vs Komoot/Strava/Outdooractive.

## Not planned / rejected

- Fabricated or thin SEO pages purely for keywords.
- Claims about features Tarnoo doesn't have (offline, live tracking, etc.) unless
  actually built.
