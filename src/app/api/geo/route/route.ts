import { NextRequest, NextResponse } from "next/server";
import { checkLimit, clientIp } from "@/lib/ratelimit";
import {
  GEO_ROUTE_BASE,
  geoHeaders,
  isSport,
  SPORT_PROFILES,
  surfaceBucket,
} from "@/lib/geo";

export const dynamic = "force-dynamic";

// BRouter is CPU-bound op de route-lengte: korte routes <2s, maar lange
// (~200 km) kosten 8-19s en een 250 km MTB-route tot ~59s. De Vercel-default
// van 10s kapte die stil af → "route tekent niet" voor lange (vaak
// buitenlandse) trajecten, terwijl korte NL-routes wél werkten. Distance is
// de factor, niet het land (Amsterdam→Maastricht 210 km = 18.5s, óók over de
// 10s). 60s dekt elk realistisch traject met ruime marge. Paid-plan vereist.
export const maxDuration = 60;

// Harde bovengrens op de BRouter-call zelf: nét onder maxDuration zodat een
// echt-te-lange/hangende route een nette router_unavailable teruggeeft
// (met vertaalde melding) i.p.v. een rauwe Vercel-504 waar de client
// "generic error" van maakt.
const BROUTER_TIMEOUT_MS = 55_000;

// GET /api/geo/route?points=4.30,52.07|5.12,52.09&sport=gravel
// Proxies BRouter and returns geometry + stats + surface/waytype breakdown.
export async function GET(req: NextRequest) {
  const rl = await checkLimit("geo-route", clientIp(req), 30);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterS) } },
    );
  }
  const points = req.nextUrl.searchParams.get("points");
  const sport = req.nextUrl.searchParams.get("sport") ?? "touring";
  if (!points || !isSport(sport)) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const lonlats = points
    .split("|")
    .map((p) => p.trim())
    .filter(Boolean);
  if (lonlats.length < 2 || lonlats.length > 10) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const url = new URL(GEO_ROUTE_BASE);
  url.searchParams.set("lonlats", lonlats.join("|"));
  url.searchParams.set("profile", SPORT_PROFILES[sport]);
  url.searchParams.set("alternativeidx", "0");
  url.searchParams.set("format", "geojson");
  // GEN-143: voicehints voor turn-by-turn course-export. Empirisch geprobed
  // op onze 1.7.10 (2026-07-22): timode=2 werkt zonder profielaanpassing,
  // shape = [[coordIndex, command, roundaboutExit, distM, angle], ...].
  url.searchParams.set("timode", "2");

  try {
    const res = await fetch(url, {
      headers: geoHeaders(),
      cache: "no-store",
      signal: AbortSignal.timeout(BROUTER_TIMEOUT_MS),
    });
    const body = await res.text();
    if (!res.ok || !body.startsWith("{")) {
      // BRouter returns plain-text errors (e.g. "position not mapped")
      return NextResponse.json(
        { error: "no_route", detail: body.slice(0, 200) },
        { status: 422 },
      );
    }
    const data = JSON.parse(body);
    const feature = data.features?.[0];
    if (!feature) {
      return NextResponse.json({ error: "no_route" }, { status: 422 });
    }
    const props = feature.properties;

    // Per-point elevation from the 3rd coordinate (GEN-101/105 data source)
    const coords: [number, number, number?][] = feature.geometry.coordinates;
    const elevation = coords.map((c) => c[2] ?? 0);

    // GEN-129: which restriction tags warrant a warning for this sport.
    // Scope (spike 2026-07-20): STATIC access tags only — lookups.dat 1.7.10
    // carries no *:conditional data, so seasonal closures can't be detected.
    const footSport = sport === "hike" || sport === "run";
    const alertFor = (tags: Record<string, string>): string | null => {
      if (tags.access === "no" || tags.access === "private") {
        return `access_${tags.access}`;
      }
      if (!footSport && tags.bicycle === "no") return "bicycle_no";
      if (footSport && tags.foot === "no") return "foot_no";
      return null;
    };
    // Nearest geometry index for a message coordinate (microdegrees).
    const idxNear = (lonU: number, latU: number): number => {
      const lon = lonU / 1e6;
      const lat = latU / 1e6;
      let best = 0;
      let bestD = Infinity;
      for (let i = 0; i < coords.length; i++) {
        const dx = coords[i][0] - lon;
        const dy = coords[i][1] - lat;
        const d = dx * dx + dy * dy;
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      return best;
    };

    // GEN-143: voicehints → compacte turns. Commandcodes (locus/timode=2,
    // empirisch geverifieerd tegen de hoeken in de probe-response):
    // 1=C 2=TL 3=TSLL 4=TSHL 5=TR 6=TSLR 7=TSHR 8=KL 9=KR 10..12=u-turns,
    // 13+=rotonde (3e element = afrit-nummer).
    const TURN_CODE: Record<number, string> = {
      1: "straight",
      2: "left",
      3: "slight_left",
      4: "sharp_left",
      5: "right",
      6: "slight_right",
      7: "sharp_right",
      8: "keep_left",
      9: "keep_right",
      10: "uturn",
      11: "uturn",
      12: "uturn",
    };
    type Turn = { i: number; t: string; exit?: number };
    const voicehints: number[][] = props.voicehints ?? [];
    const turns: Turn[] = voicehints
      .map((h) => {
        const [i, cmd, exit] = [h[0] ?? 0, h[1] ?? 0, h[2] ?? 0];
        if (i <= 0 || i >= coords.length) return null;
        const t = TURN_CODE[cmd] ?? (cmd >= 13 ? "roundabout" : null);
        if (!t) return null;
        return t === "roundabout" && exit > 0 ? { i, t, exit } : { i, t };
      })
      .filter((x): x is Turn => x !== null);

    // messages: [header, ...rows] — per-way-stretch WayTags. Each row's
    // Longitude/Latitude is the END of its stretch; the stretch starts at
    // the previous row's end (route start for the first row).
    const messages: string[][] = props.messages ?? [];
    const surfacesKm: Record<string, number> = {};
    const waytypesKm: Record<string, number> = {};
    const buckets = { paved: 0, unpaved: 0, unknown: 0 };
    type Alert = { kind: string; fromIdx: number; toIdx: number; distanceM: number };
    const alerts: Alert[] = [];
    // Onverharde stukken als index-ranges op de geometrie: de kaart kan dan
    // tonen wélk deel gravel is i.p.v. alleen hoeveel. Zelfde vorm als alerts.
    // Aaneengesloten stukken worden samengevoegd, ook als het ene gravel is en
    // het volgende compacted — voor de fietser is dat één onverhard stuk.
    type Run = { fromIdx: number; toIdx: number; distanceM: number; surfaces: string[] };
    const unpavedRuns: Run[] = [];
    let prevIdx = 0;
    for (const row of messages.slice(1)) {
      const distance = parseInt(row[3] ?? "0", 10);
      const tags: Record<string, string> = {};
      for (const kv of (row[9] ?? "").split(" ")) {
        const i = kv.indexOf("=");
        if (i > 0) tags[kv.slice(0, i)] = kv.slice(i + 1);
      }
      const surface = tags.surface;
      const highway = tags.highway ?? "unknown";
      surfacesKm[surface ?? "unknown"] =
        (surfacesKm[surface ?? "unknown"] ?? 0) + distance;
      waytypesKm[highway] = (waytypesKm[highway] ?? 0) + distance;
      buckets[surfaceBucket(surface)] += distance;

      const endIdx = idxNear(parseInt(row[0] ?? "0", 10), parseInt(row[1] ?? "0", 10));
      const kind = alertFor(tags);
      if (kind && endIdx > prevIdx) {
        const last = alerts[alerts.length - 1];
        if (last && last.kind === kind && last.toIdx === prevIdx) {
          // consecutive stretches of the same restriction — merge
          last.toIdx = endIdx;
          last.distanceM += distance;
        } else {
          alerts.push({ kind, fromIdx: prevIdx, toIdx: endIdx, distanceM: distance });
        }
      }
      if (surfaceBucket(surface) === "unpaved" && endIdx > prevIdx) {
        const last = unpavedRuns[unpavedRuns.length - 1];
        if (last && last.toIdx === prevIdx) {
          last.toIdx = endIdx;
          last.distanceM += distance;
          if (surface && !last.surfaces.includes(surface)) last.surfaces.push(surface);
        } else {
          unpavedRuns.push({
            fromIdx: prevIdx,
            toIdx: endIdx,
            distanceM: distance,
            surfaces: surface ? [surface] : [],
          });
        }
      }
      prevIdx = Math.max(prevIdx, endIdx);
    }
    // Losse oprittetjes en oversteken zijn ruis op de kaart; pas na het mergen
    // filteren, anders knipt een kort tussenstuk een lang stuk in tweeën.
    const MIN_RUN_M = 150;
    const runs = unpavedRuns.filter((r) => r.distanceM >= MIN_RUN_M);

    return NextResponse.json({
      geometry: {
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates: coords },
      },
      stats: {
        distanceM: parseInt(props["track-length"], 10),
        timeS: parseInt(props["total-time"], 10),
        ascendM: parseInt(props["filtered ascend"], 10),
        descendM: Math.abs(parseInt(props["plain-ascend"], 10) - parseInt(props["filtered ascend"], 10)),
      },
      surfaces: { buckets, detailM: surfacesKm },
      waytypes: waytypesKm,
      elevation,
      alerts,
      unpavedRuns: runs,
      turns,
    });
  } catch {
    return NextResponse.json(
      { error: "router_unavailable" },
      { status: 503 },
    );
  }
}
