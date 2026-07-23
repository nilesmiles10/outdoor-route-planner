// GEN-145 — importeer officiële routes uit OSM-routerelaties (ODbL).
// Draaien: npx tsx scripts/import-trails.ts <mtb|hike|touring> [--country XX] [--limit N]
//
// Pipeline: Overpass (out geom) → way-assembly (greedy endpoint-match aan
// beide uiteinden, rollen alternate/excursion uitgesloten, gap/afstand-
// gates) → Douglas-Peucker-simplify → terrarium-elevation →
// surfaces/waytypes uit way-tags → regio via Natural-Earth admin-1
// point-in-polygon (offline; NL/BE mag ook Photon via SSH-tunnel 2322) →
// NDJSON naar scripts/out/trails-<sport>-<XX>.ndjson; laden via
// scripts/load-trails.ts (edge function).
//
// Elke reject wordt gelogd met reden: geen stille truncatie.

import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { surfaceBucket } from "../src/lib/geo";

const SPORT = process.argv[2] as "mtb" | "hike" | "touring";
const COUNTRY = (() => {
  const i = process.argv.indexOf("--country");
  return (i > 0 ? process.argv[i + 1] : "NL").toUpperCase();
})();
const LIMIT = (() => {
  const i = process.argv.indexOf("--limit");
  return i > 0 ? parseInt(process.argv[i + 1], 10) : Infinity;
})();
if (!["mtb", "hike", "touring"].includes(SPORT) || !/^[A-Z]{2}$/.test(COUNTRY)) {
  console.error(
    "usage: npx tsx scripts/import-trails.ts <mtb|hike|touring> [--country XX] [--limit N]",
  );
  process.exit(1);
}

// Mirrors gerouleerd: overpass-api.de heeft 2 slots per IP en na veel
// probes een cooldown; kumi.systems is ruimer.
const OVERPASS_MIRRORS = [
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass-api.de/api/interpreter",
];
// Regio-bron: Natural Earth 10m admin-1 (public domain) — offline
// point-in-polygon, werkt voor álle landen (onze Photon kent alleen NL+BE).
const NE_URL =
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson";
const NE_FILE = "scripts/out/ne_admin1.geojson";

// Overpass-selectie per sport. Gates op lengte volgen ná assembly.
const QUERY: Record<string, string> = {
  mtb: `relation["route"="mtb"]["name"](area.c);`,
  hike: `( relation["route"="hiking"]["name"](area.c);
           relation["route"="foot"]["name"](area.c); );`,
  touring: `relation["route"="bicycle"]["name"]["network"!="rcn"](area.c);`,
};
// Lengte-vensters (meters) per sport — plan: dagroutes eerst.
const LENGTH_GATE: Record<string, [number, number]> = {
  mtb: [2_000, 80_000],
  hike: [3_000, 40_000],
  touring: [10_000, 80_000],
};
const SPEED_KMH: Record<string, number> = { mtb: 15, hike: 4.5, touring: 18 };

// hike-curatie: NL houdt het oorspronkelijke gedrag (netwerk incl. lwn óf
// NL-naam-patroon); overige landen alléén nwn/rwn — buitenlandse lwn's
// (zeker DE) zijn gigantisch en naam-patronen zijn taalgebonden.
const HIKE_NAME_RE = /klompenpad|NS-wandeling|ommetje|wandelroute|wandeling|streekpad|pad$/i;
function hikeAllowed(t: Record<string, string>, name: string): boolean {
  if (COUNTRY === "NL") {
    const netOk = t.network === "nwn" || t.network === "rwn" || t.network === "lwn";
    return netOk || HIKE_NAME_RE.test(name);
  }
  return t.network === "nwn" || t.network === "rwn";
}

type LonLat = [number, number];

function havM(a: LonLat, b: LonLat): number {
  const R = 6371000;
  const dLat = ((b[1] - a[1]) * Math.PI) / 180;
  const dLon = ((b[0] - a[0]) * Math.PI) / 180;
  const la1 = (a[1] * Math.PI) / 180;
  const la2 = (b[1] * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// --- Overpass met retry (huisregels: één tegelijk, form-encoded) ---
async function overpass(body: string): Promise<Record<string, unknown>> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const url = OVERPASS_MIRRORS[attempt % OVERPASS_MIRRORS.length];
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        // Zonder UA weigeren beide mirrors (kumi expliciet, .de met 406).
        "User-Agent": "tarnoo-import/1.0 (trails import; contact via repo)",
      },
      body: `data=${encodeURIComponent(body)}`,
    });
    const text = await res.text();
    if (text.trimStart().startsWith("{")) return JSON.parse(text);
    // Foutpagina tonen — syntaxfout en rate-limit zien er anders uit.
    const snippet = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 220);
    console.log(`  overpass non-JSON van ${new URL(url).host} (poging ${attempt + 1}): ${snippet}`);
    await new Promise((r) => setTimeout(r, attempt < 2 ? 5_000 : 30_000));
  }
  throw new Error("overpass: retries exhausted");
}

// --- way-assembly: greedy endpoint-matching, flips toegestaan ---
type Way = { coords: LonLat[]; tags: Record<string, string> };
const JOIN_TOL_M = 30;

// Greedy matching aan BEIDE uiteinden van de lijn (append én prepend,
// met flips): de eerste member-way ligt vaak midden in de route — alleen
// aan het eind aanbouwen rekende alles daarvóór onterecht als gap.
function assemble(ways: Way[]): { coords: LonLat[]; gapM: number } | null {
  if (ways.length === 0) return null;
  const pool = ways.map((w) => ({ ...w }));
  const first = pool.shift()!;
  let line: LonLat[] = [...first.coords];
  let totalGap = 0;
  while (pool.length > 0) {
    const head = line[0];
    const tail = line[line.length - 1];
    let best = -1;
    let bestD = Infinity;
    let flip = false;
    let atHead = false;
    for (let i = 0; i < pool.length; i++) {
      const c = pool[i].coords;
      const cand: [number, boolean, boolean][] = [
        [havM(tail, c[0]), false, false],            // append, geen flip
        [havM(tail, c[c.length - 1]), true, false],  // append, flip
        [havM(head, c[c.length - 1]), false, true],  // prepend, geen flip
        [havM(head, c[0]), true, true],              // prepend, flip
      ];
      for (const [d, f, h] of cand) {
        if (d < bestD) { bestD = d; best = i; flip = f; atHead = h; }
      }
    }
    if (best < 0) break;
    const next = pool.splice(best, 1)[0];
    const coords = flip ? [...next.coords].reverse() : next.coords;
    if (bestD > JOIN_TOL_M) {
      totalGap += bestD;
      if (totalGap > 100) return { coords: line, gapM: totalGap };
      line = atHead ? coords.concat(line) : line.concat(coords);
    } else {
      line = atHead ? coords.slice(0, -1).concat(line) : line.concat(coords.slice(1));
    }
  }
  return { coords: line, gapM: totalGap };
}

// --- Douglas-Peucker (op meters, benaderd) ---
function simplify(coords: LonLat[], tolM: number): LonLat[] {
  if (coords.length <= 2) return coords;
  const keep = new Uint8Array(coords.length);
  keep[0] = keep[coords.length - 1] = 1;
  const stack: [number, number][] = [[0, coords.length - 1]];
  const latScale = Math.cos((coords[0][1] * Math.PI) / 180);
  const toXY = (c: LonLat) => [c[0] * 111320 * latScale, c[1] * 110540];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    if (b - a < 2) continue;
    const [ax, ay] = toXY(coords[a]);
    const [bx, by] = toXY(coords[b]);
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy || 1;
    let maxD = 0, maxI = -1;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = toXY(coords[i]);
      const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
      const d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
      if (d > maxD) { maxD = d; maxI = i; }
    }
    if (maxD > tolM && maxI > 0) {
      keep[maxI] = 1;
      stack.push([a, maxI], [maxI, b]);
    }
  }
  return coords.filter((_, i) => keep[i]);
}

// --- terrarium-elevation (z12) met tile-cache ---
const tileCache = new Map<string, Buffer | null>();
async function tilePng(z: number, x: number, y: number): Promise<Buffer | null> {
  const key = `${z}/${x}/${y}`;
  if (tileCache.has(key)) return tileCache.get(key)!;
  try {
    const res = await fetch(
      `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`,
    );
    if (!res.ok) throw new Error(String(res.status));
    const buf = Buffer.from(await res.arrayBuffer());
    tileCache.set(key, buf);
    return buf;
  } catch {
    tileCache.set(key, null);
    return null;
  }
}

// Minimal PNG-decoder is overkill — gebruik sharp? Niet in deps. Truc:
// terrarium levert ook 256x256 PNG; decoderen zonder dep kan via
// zlib+filters (PNG is deflate + per-rij filters). Implementatie hieronder
// dekt de standaard 8-bit RGB(A) non-interlaced PNG's van deze bron.
import { inflateSync } from "node:zlib";
function decodePng(buf: Buffer): { w: number; h: number; px: Buffer; ch: number } | null {
  if (buf.readUInt32BE(0) !== 0x89504e47) return null;
  let pos = 8;
  let w = 0, h = 0, bitDepth = 0, colorType = 0;
  const idat: Buffer[] = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("ascii", pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6) || data[12] !== 0) return null;
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") break;
    pos += 12 + len;
  }
  const ch = colorType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * ch;
  const px = Buffer.alloc(h * stride);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = px.subarray(y * stride, (y + 1) * stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? out[i - ch] : 0;
      const b = prev[i];
      const c = i >= ch ? prev[i - ch] : 0;
      let v = row[i];
      if (f === 1) v = (v + a) & 0xff;
      else if (f === 2) v = (v + b) & 0xff;
      else if (f === 3) v = (v + ((a + b) >> 1)) & 0xff;
      else if (f === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xff;
      }
      out[i] = v;
    }
    prev = out;
  }
  return { w, h, px, ch };
}

const decodedCache = new Map<string, ReturnType<typeof decodePng>>();
async function elevationAt(lon: number, lat: number): Promise<number> {
  const z = 12;
  const n = 2 ** z;
  const xf = ((lon + 180) / 360) * n;
  const latR = (lat * Math.PI) / 180;
  const yf = ((1 - Math.log(Math.tan(latR) + 1 / Math.cos(latR)) / Math.PI) / 2) * n;
  const tx = Math.floor(xf), ty = Math.floor(yf);
  const key = `${z}/${tx}/${ty}`;
  if (!decodedCache.has(key)) {
    const buf = await tilePng(z, tx, ty);
    decodedCache.set(key, buf ? decodePng(buf) : null);
  }
  const img = decodedCache.get(key);
  if (!img) return 0;
  const pxX = Math.min(img.w - 1, Math.floor((xf - tx) * img.w));
  const pxY = Math.min(img.h - 1, Math.floor((yf - ty) * img.h));
  const o = (pxY * img.w + pxX) * img.ch;
  const [r, g, b] = [img.px[o], img.px[o + 1], img.px[o + 2]];
  return r * 256 + g + b / 256 - 32768;
}

// --- ascend/descend met ruisdrempel (zelfde geest als BRouter's filtered) ---
function climbStats(elev: number[]): { ascendM: number; descendM: number } {
  let up = 0, down = 0, ref = elev[0] ?? 0;
  for (const e of elev) {
    const d = e - ref;
    if (d > 3) { up += d; ref = e; }
    else if (d < -3) { down += -d; ref = e; }
  }
  return { ascendM: Math.round(up), descendM: Math.round(down) };
}

// --- Natural-Earth admin-1 point-in-polygon (offline, alle landen) ---
type NeFeature = {
  name: string;
  bbox: [number, number, number, number];
  polys: LonLat[][][]; // multipolygon: [poly][ring][point]
};
let neFeatures: NeFeature[] | null = null;

async function loadNe(): Promise<NeFeature[]> {
  if (neFeatures) return neFeatures;
  if (!existsSync(NE_FILE)) {
    console.log("Natural Earth admin-1 downloaden (~25MB, eenmalig)…");
    const res = await fetch(NE_URL);
    if (!res.ok) throw new Error(`NE download failed: ${res.status}`);
    writeFileSync(NE_FILE, Buffer.from(await res.arrayBuffer()));
  }
  const gj = JSON.parse(readFileSync(NE_FILE, "utf8")) as {
    features: {
      properties: { name: string; iso_a2: string };
      geometry: { type: string; coordinates: unknown };
    }[];
  };
  neFeatures = gj.features
    .filter((f) => f.properties.iso_a2 === COUNTRY)
    .map((f) => {
      const polys = (
        f.geometry.type === "Polygon"
          ? [f.geometry.coordinates]
          : f.geometry.coordinates
      ) as LonLat[][][];
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const poly of polys)
        for (const pt of poly[0]) {
          if (pt[0] < minX) minX = pt[0];
          if (pt[0] > maxX) maxX = pt[0];
          if (pt[1] < minY) minY = pt[1];
          if (pt[1] > maxY) maxY = pt[1];
        }
      return { name: f.properties.name, bbox: [minX, minY, maxX, maxY], polys };
    });
  console.log(`NE admin-1: ${neFeatures.length} regio's voor ${COUNTRY}`);
  return neFeatures;
}

function inRing(pt: LonLat, ring: LonLat[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (
      yi > pt[1] !== yj > pt[1] &&
      pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi
    ) {
      inside = !inside;
    }
  }
  return inside;
}

async function neRegion(lon: number, lat: number): Promise<string | null> {
  const feats = await loadNe();
  for (const f of feats) {
    const [minX, minY, maxX, maxY] = f.bbox;
    if (lon < minX || lon > maxX || lat < minY || lat > maxY) continue;
    for (const poly of f.polys) {
      if (inRing([lon, lat], poly[0])) return f.name;
    }
  }
  return null;
}

async function main() {
  console.log(`== trails-import: sport=${SPORT} country=${COUNTRY} ==`);
  const skipped: Record<string, string[]> = {};
  const skip = (reason: string, name: string) => {
    (skipped[reason] ??= []).push(name);
  };

  // 1) tags-only ophalen (licht) en de relatie-niveau curatie VOORAF
  //    toepassen — zo halen we alleen geometrie op voor kandidaten.
  const ids = (await overpass(`[out:json][timeout:300];
area["ISO3166-1"="${COUNTRY}"][admin_level=2]->.c;
${QUERY[SPORT]}
out tags;`)) as { elements: { id: number; tags?: Record<string, string> }[] };
  console.log(`relations found: ${ids.elements.length}`);
  let candidates = ids.elements.filter((e) => {
    const t = e.tags ?? {};
    const name = t.name ?? `osm-${e.id}`;
    if (SPORT === "mtb" && (t.roundtrip === "no" || /verbinding/i.test(name))) {
      skip("connector", name);
      return false;
    }
    if (SPORT === "hike" && !hikeAllowed(t, name)) {
      skip("hike-curatie (netwerk/naam)", name);
      return false;
    }
    return true;
  });
  console.log(`na relatie-curatie: ${candidates.length}`);
  if (Number.isFinite(LIMIT)) candidates = candidates.slice(0, LIMIT);
  const relIds = candidates.map((e) => e.id);

  const out: Record<string, unknown>[] = [];
  // Bulk-fetch: 'out geom' op relations levert member-way-geometrie
  // (incl. rol) inline → 2 queries per chunk i.p.v. 1 per relatie.
  // Rollen 'alternate'/'excursion'/etc. worden uitgesloten — dat zijn
  // de zijtakken die assembly eerder lieten falen.
  const SKIP_ROLES = new Set(["alternate", "excursion", "approach", "connection", "link"]);
  const CHUNK = 50;
  for (let c = 0; c < relIds.length; c += CHUNK) {
    const chunk = relIds.slice(c, c + CHUNK);
    console.log(`chunk ${c / CHUNK + 1}/${Math.ceil(relIds.length / CHUNK)} (${chunk.length} rels)`);
    // Onbeheerde queue: één kapotte chunk mag geen land killen.
    try {
    // let op: 'out geom;' (body-verbosity) — 'out tags geom' laat de
    // members-array weg en dan lijkt élke relatie way-loos.
    const data = (await overpass(`[out:json][timeout:300];
relation(id:${chunk.join(",")});
out geom;`)) as {
      elements: {
        type: string;
        id: number;
        tags?: Record<string, string>;
        members?: {
          type: string;
          ref: number;
          role: string;
          geometry?: { lon: number; lat: number }[];
        }[];
      }[];
    };
    const tagsData = (await overpass(`[out:json][timeout:180];
relation(id:${chunk.join(",")});
way(r);
out tags;`)) as {
      elements: { type: string; id: number; tags?: Record<string, string> }[];
    };
    const wayTags = new Map<number, Record<string, string>>();
    for (const e of tagsData.elements) {
      if (e.type === "way") wayTags.set(e.id, e.tags ?? {});
    }

    const rels = data.elements.filter((e) => e.type === "relation");
    for (const rel of rels) {
      const t = rel.tags ?? {};
      const name = t.name ?? `osm-${rel.id}`;
      if (SPORT === "mtb" && (t.roundtrip === "no" || /verbinding/i.test(name))) {
        skip("connector", name);
        continue;
      }
      if (SPORT === "hike" && !hikeAllowed(t, name)) {
        skip("hike-curatie (netwerk/naam)", name);
        continue;
      }
      const ways: Way[] = (rel.members ?? [])
        .filter(
          (m) =>
            m.type === "way" &&
            m.geometry &&
            m.geometry.length > 1 &&
            !SKIP_ROLES.has(m.role),
        )
        .map((m) => ({
          coords: m.geometry!.map((g) => [g.lon, g.lat] as LonLat),
          tags: wayTags.get(m.ref) ?? {},
        }));
      if (ways.length === 0) {
        skip("geen ways", name);
        continue;
      }
      const asm = assemble(ways);
      if (!asm || asm.gapM > 100) {
        skip(`assembly-gap>${asm ? Math.round(asm.gapM) : "?"}m`, name);
        continue;
      }
      // afstand + gates
      let distM = 0;
      for (let i = 1; i < asm.coords.length; i++) distM += havM(asm.coords[i - 1], asm.coords[i]);
      const [minL, maxL] = LENGTH_GATE[SPORT];
      if (distM < minL) { skip("te kort", name); continue; }
      if (distM > maxL) { skip("te lang (multi-day → latere issue)", name); continue; }
      const osmDist = t.distance ? parseFloat(String(t.distance).replace(",", ".")) * 1000 : null;
      if (osmDist && Math.abs(distM - osmDist) / osmDist > 0.2) {
        skip(`afstand wijkt >20% af van OSM-tag (${(distM / 1000).toFixed(1)} vs ${(osmDist / 1000).toFixed(1)} km)`, name);
        continue;
      }

      const coords = simplify(asm.coords, 5).slice(0, 3000);
      const elevation: number[] = [];
      for (const [lon, lat] of coords) elevation.push(Math.round((await elevationAt(lon, lat)) * 10) / 10);
      const { ascendM, descendM } = climbStats(elevation);

      // surfaces/waytypes uit way-tags, gewogen op way-lengte
      const buckets = { paved: 0, unpaved: 0, unknown: 0 };
      const detailM: Record<string, number> = {};
      const waytypes: Record<string, number> = {};
      for (const w of ways) {
        let wl = 0;
        for (let i = 1; i < w.coords.length; i++) wl += havM(w.coords[i - 1], w.coords[i]);
        const s = w.tags.surface;
        buckets[surfaceBucket(s)] += wl;
        detailM[s ?? "unknown"] = (detailM[s ?? "unknown"] ?? 0) + wl;
        const hw = w.tags.highway ?? "unknown";
        waytypes[hw] = (waytypes[hw] ?? 0) + wl;
      }

      const mid = coords[Math.floor(coords.length / 2)];
      const region = await neRegion(mid[0], mid[1]);
      // Grensoverschrijdende relaties verschijnen in de area-query van
      // beide landen; midpoint buiten de NE-polygonen van dít land =
      // duplicaat van de buurland-run → skippen (voorkomt ook dat de
      // upsert country/region van de eerdere run overschrijft).
      if (region === null) {
        skip("midpoint buiten land (grens-duplicaat?)", name);
        continue;
      }

      out.push({
        osm_id: rel.id,
        name: name.slice(0, 120),
        sport: SPORT,
        country: COUNTRY,
        region,
        network: t.network ?? null,
        operator: t.operator ?? null,
        roundtrip: t.roundtrip === "yes" || havM(coords[0], coords[coords.length - 1]) < 200,
        geometry: { type: "LineString", coordinates: coords.map(([lo, la]) => [
          Math.round(lo * 1e6) / 1e6,
          Math.round(la * 1e6) / 1e6,
        ]) },
        elevation,
        stats: {
          distanceM: Math.round(distM),
          timeS: Math.round((distM / 1000 / SPEED_KMH[SPORT]) * 3600),
          ascendM,
          descendM,
        },
        surfaces: {
          buckets: {
            paved: Math.round(buckets.paved),
            unpaved: Math.round(buckets.unpaved),
            unknown: Math.round(buckets.unknown),
          },
          detailM: Object.fromEntries(Object.entries(detailM).map(([k, v]) => [k, Math.round(v)])),
        },
        waytypes: Object.fromEntries(Object.entries(waytypes).map(([k, v]) => [k, Math.round(v)])),
        source_url: `https://www.openstreetmap.org/relation/${rel.id}`,
      });
      console.log(`  + ${name} (${(distM / 1000).toFixed(1)} km, ${region ?? "?"})`);
    }
    } catch (e) {
      console.log(`  !! chunk ${c / CHUNK + 1} overgeslagen na fout: ${(e as Error).message}`);
      skip("chunk-fout (zie log)", `chunk ${c / CHUNK + 1}`);
    }
  }

  mkdirSync("scripts/out", { recursive: true });
  const file = `scripts/out/trails-${SPORT}-${COUNTRY}.ndjson`;
  writeFileSync(file, out.map((r) => JSON.stringify(r)).join("\n"));

  console.log(`\n== QA-rapport (${SPORT} ${COUNTRY}) ==`);
  console.log(`imported: ${out.length} → ${file}`);
  for (const [reason, names] of Object.entries(skipped)) {
    console.log(`skipped ${names.length}× ${reason}`);
    if (names.length <= 6) for (const n of names) console.log(`   - ${n}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
