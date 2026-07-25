// GEN-115 — seed point-highlights uit OSM-POI's (ODbL).
// Draaien: npx tsx scripts/import-highlights.ts [--country XX] [--cats a,b]
//          [--limit N] [--count]
//
// Pipeline: Overpass (nwr + out center, dus ways/relations tellen ook mee)
// → notability-filter (naam verplicht + per-categorie tags) → grid-dedupe
// (max N per ~2km-cel per categorie, tegen clusters) → regio via
// Natural-Earth admin-1 point-in-polygon (offline, zelfde bron als
// import-trails) → NDJSON naar scripts/out/highlights-<XX>.ndjson.
//
// De eerste seed (2026-07-19, 680 rijen NL+BE) dekte alleen peak/viewpoint/
// hut. Dit script generaliseert dat naar alle 8 categorieën van de
// CHECK-constraint en naar willekeurige landen. osm_id is UNIQUE, dus
// herhaald laden is idempotent (loader doet on conflict do nothing).
//
// Elke reject wordt geteld en gelogd: geen stille truncatie.

import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";

const COUNTRY = (() => {
  const i = process.argv.indexOf("--country");
  return (i > 0 ? process.argv[i + 1] : "NL").toUpperCase();
})();
const LIMIT = (() => {
  const i = process.argv.indexOf("--limit");
  return i > 0 ? parseInt(process.argv[i + 1], 10) : Infinity;
})();
const COUNT_ONLY = process.argv.includes("--count");

// Overpass-selectors per categorie. `nwr` = node/way/relation; met
// `out center` krijgen ways/relations (kastelen, stranden, reservaten) een
// representatief punt. Naam is overal verplicht — naamloze POI's zijn geen
// highlight en vervuilen de kaart.
const SELECTORS: Record<string, string[]> = {
  peak: [`nwr["natural"="peak"]["name"]`],
  viewpoint: [`nwr["tourism"="viewpoint"]["name"]`],
  hut: [
    `nwr["tourism"="alpine_hut"]["name"]`,
    `nwr["tourism"="wilderness_hut"]["name"]`,
    `nwr["amenity"="shelter"]["name"]["shelter_type"!="public_transport"]`,
  ],
  water: [
    `nwr["waterway"="waterfall"]["name"]`,
    `nwr["natural"="spring"]["name"]`,
    `nwr["natural"="beach"]["name"]`,
  ],
  monument: [
    `nwr["historic"="castle"]["name"]`,
    `nwr["historic"="ruins"]["name"]`,
    `nwr["historic"="fort"]["name"]`,
    `nwr["man_made"="lighthouse"]["name"]`,
    `nwr["historic"="monument"]["name"]`,
  ],
  nature: [
    // Kale cave_entrance levert in NL honderden genummerde mergelgroeve-
    // ingangen op ("Gewandgroeve 1", "Mettenberg I") — geen highlight.
    // wikidata/tourism als generieke notability-proxy houdt de echte over.
    `nwr["natural"="cave_entrance"]["name"]["wikidata"]`,
    `nwr["natural"="cave_entrance"]["name"]["tourism"]`,
    // Kale nature_reserve = 1000+ snippers in NL én de query die de
    // undici-timeout trok; wikidata houdt de bekende gebieden over.
    `nwr["leisure"="nature_reserve"]["name"]["wikidata"]`,
    `nwr["natural"="tree"]["name"]["denotation"~"natural_monument|landmark"]`,
  ],
  // Cafés zijn er tienduizenden en zijn zelden een "highlight"; alleen op
  // expliciet verzoek, en dan nog met terras als zwakke notability-proxy.
  cafe: [`nwr["amenity"="cafe"]["name"]["outdoor_seating"="yes"]`],
};
const DEFAULT_CATS = ["peak", "viewpoint", "hut", "water", "monument", "nature"];
const CATS = (() => {
  const i = process.argv.indexOf("--cats");
  const list = i > 0 ? process.argv[i + 1].split(",") : DEFAULT_CATS;
  return list.map((c) => c.trim()).filter((c) => c in SELECTORS);
})();

// Max highlights per ~2km-cel per categorie. Voorkomt dat één duingebied of
// stadscentrum de kaart volgooit met 40 identieke punten.
const CELL_DEG = 0.02;
const PER_CELL = 2;

// Overzeese gebiedsdelen buiten sluiten. Overpass' area["ISO3166-1"="NL"]
// bevat óók Caribisch Nederland (Bonaire deelt iso_a2 "NL"!) — de eerste
// NL-run leverde daardoor Fontein Cave (Aruba) en Rif Fort (Curaçao) op.
// Een expliciete Europa-bbox is de simpelste robuuste gate; bewuste
// grens: Canarische Eilanden en Madeira vallen hier buiten, Azoren binnen.
const EUROPE_BBOX = { minLon: -32, maxLon: 45, minLat: 34, maxLat: 72 };
const inEurope = (lon: number, lat: number) =>
  lon >= EUROPE_BBOX.minLon &&
  lon <= EUROPE_BBOX.maxLon &&
  lat >= EUROPE_BBOX.minLat &&
  lat <= EUROPE_BBOX.maxLat;

const OVERPASS_MIRRORS = [
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass-api.de/api/interpreter",
];
const NE_FILE = "scripts/out/ne_admin1.geojson";
const NE_URL =
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson";

type LonLat = [number, number];
type Element = {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

async function overpass(body: string): Promise<Record<string, unknown>> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const url = OVERPASS_MIRRORS[attempt % OVERPASS_MIRRORS.length];
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          // Zonder UA weigeren beide mirrors (kumi expliciet, .de met 406).
          "User-Agent": "tarnoo-import/1.0 (highlights import; contact via repo)",
        },
        body: `data=${encodeURIComponent(body)}`,
      });
      const text = await res.text();
      if (text.trimStart().startsWith("{")) return JSON.parse(text);
      const snippet = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 200);
      console.log(`  overpass non-JSON van ${new URL(url).host} (poging ${attempt + 1}): ${snippet}`);
    } catch (e) {
      // Netwerk-throw (undici headers-timeout op zware queries) moet net zo
      // goed een retry krijgen als een non-JSON body — anders sterft de run.
      console.log(
        `  overpass fetch-fout van ${new URL(url).host} (poging ${attempt + 1}): ${(e as Error).message}`,
      );
    }
    await new Promise((r) => setTimeout(r, attempt < 2 ? 5_000 : 30_000));
  }
  throw new Error("overpass: retries exhausted");
}

// --- Natural-Earth admin-1 point-in-polygon (offline, alle landen) ---
type NeFeature = {
  name: string;
  iso: string;
  admin: string;
  bbox: [number, number, number, number];
  polys: LonLat[][][];
};
let neFeatures: NeFeature[] | null = null;

async function loadNe(): Promise<NeFeature[]> {
  if (neFeatures) return neFeatures;
  if (!existsSync(NE_FILE)) {
    console.log("  natural-earth admin-1 downloaden (~40MB, eenmalig)…");
    mkdirSync("scripts/out", { recursive: true });
    const res = await fetch(NE_URL);
    writeFileSync(NE_FILE, Buffer.from(await res.arrayBuffer()));
  }
  const raw = JSON.parse(readFileSync(NE_FILE, "utf8")) as {
    features: {
      properties: { name: string; iso_a2?: string; admin?: string };
      geometry: { type: string; coordinates: unknown };
    }[];
  };
  neFeatures = raw.features.map((f) => {
    const polys: LonLat[][][] =
      f.geometry.type === "Polygon"
        ? [f.geometry.coordinates as LonLat[][]]
        : (f.geometry.coordinates as LonLat[][][]);
    let minX = 180, minY = 90, maxX = -180, maxY = -90;
    for (const poly of polys)
      for (const ring of poly)
        for (const [x, y] of ring) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
    return {
      name: f.properties.name,
      iso: (f.properties.iso_a2 ?? "").toUpperCase(),
      admin: f.properties.admin ?? "",
      bbox: [minX, minY, maxX, maxY] as [number, number, number, number],
      polys,
    };
  });
  return neFeatures;
}

function inRing(pt: LonLat, ring: LonLat[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if (!a || !b) continue;
    const [xi, yi] = a, [xj, yj] = b;
    if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

async function neLookup(
  lon: number,
  lat: number,
): Promise<{ name: string; iso: string; admin: string } | null> {
  const feats = await loadNe();
  for (const f of feats) {
    const [minX, minY, maxX, maxY] = f.bbox;
    if (lon < minX || lon > maxX || lat < minY || lat > maxY) continue;
    for (const poly of f.polys) {
      const outer = poly[0];
      if (outer && inRing([lon, lat], outer)) {
        return { name: f.name, iso: f.iso, admin: f.admin };
      }
    }
  }
  return null;
}

type Row = {
  osm_id: string;
  name: string;
  category: string;
  lon: number;
  lat: number;
  description: string | null;
  region: string | null;
};

async function main() {
  console.log(`== highlights-import: country=${COUNTRY} cats=${CATS.join(",")} ==`);
  mkdirSync("scripts/out", { recursive: true });

  const rows: Row[] = [];
  // Eén POI kan meerdere selectors matchen (cave_entrance met zowel wikidata
  // als tourism). osm_id is UNIQUE, dus dubbelen moeten er hier al uit —
  // anders raakt één upsert-batch dezelfde rij twee keer.
  const seen = new Set<string>();
  const stats: Record<string, { raw: number; noCoord: number; cell: number; kept: number }> = {};

  for (const cat of CATS) {
    const selectors = SELECTORS[cat] ?? [];
    const union = selectors.map((s) => `  ${s}(area.c);`).join("\n");

    if (COUNT_ONLY) {
      const cq = `[out:json][timeout:300];
area["ISO3166-1"="${COUNTRY}"][admin_level=2]->.c;
(
${union}
);
out count;`;
      const data = (await overpass(cq)) as { elements?: { tags?: { total?: string } }[] };
      const total = data.elements?.[0]?.tags?.total ?? "?";
      console.log(`  ${cat.padEnd(10)} total=${total}`);
      await new Promise((r) => setTimeout(r, 2000));
      continue;
    }

    // Eén query per selector i.p.v. een union: kleinere responses, minder
    // kans op de undici headers-timeout die de NL-run op nature sloopte.
    const els: Element[] = [];
    for (const sel of selectors) {
      const sq = `[out:json][timeout:300];
area["ISO3166-1"="${COUNTRY}"][admin_level=2]->.c;
${sel}(area.c);
out center;`;
      const d = (await overpass(sq)) as { elements?: Element[] };
      els.push(...(d.elements ?? []));
      await new Promise((r) => setTimeout(r, 2000));
    }
    const st = { raw: els.length, noCoord: 0, cell: 0, kept: 0 };
    const cells = new Map<string, number>();

    for (const el of els) {
      const lat = el.lat ?? el.center?.lat;
      const lon = el.lon ?? el.center?.lon;
      const name = el.tags?.name?.trim();
      if (lat == null || lon == null || !name) {
        st.noCoord++;
        continue;
      }
      const osmId = `${el.type}/${el.id}`;
      if (seen.has(osmId)) continue;
      const key = `${Math.round(lon / CELL_DEG)}:${Math.round(lat / CELL_DEG)}`;
      const used = cells.get(key) ?? 0;
      if (used >= PER_CELL) {
        st.cell++;
        continue;
      }
      cells.set(key, used + 1);
      seen.add(osmId);
      rows.push({
        osm_id: osmId,
        name: name.slice(0, 120),
        category: cat,
        lon: Math.round(lon * 1e6) / 1e6,
        lat: Math.round(lat * 1e6) / 1e6,
        description: el.tags?.description?.slice(0, 400) ?? null,
        region: null,
      });
      st.kept++;
      if (rows.length >= LIMIT) break;
    }
    stats[cat] = st;
    console.log(
      `  ${cat.padEnd(10)} raw=${st.raw} kept=${st.kept} (naamloos/geen-coord=${st.noCoord}, cel-cap=${st.cell})`,
    );
    // Overpass heeft 2 slots per IP — netjes wachten tussen categorieën.
    await new Promise((r) => setTimeout(r, 3000));
    if (rows.length >= LIMIT) break;
  }

  if (COUNT_ONLY) return;

  console.log(`  regio's bepalen + geo-gate voor ${rows.length} punten…`);
  const kept: Row[] = [];
  let offshore = 0;
  let wrongCountry = 0;
  for (const r of rows) {
    if (!inEurope(r.lon, r.lat)) {
      offshore++;
      continue;
    }
    const ne = await neLookup(r.lon, r.lat);
    // iso_a2 vangt Aruba/Curaçao/Sint Maarten (AW/CW/SX); de bbox hierboven
    // vangt Bonaire, dat wél "NL" is.
    if (ne && ne.iso && ne.iso !== COUNTRY) {
      wrongCountry++;
      continue;
    }
    r.region = ne?.name ?? null;
    kept.push(r);
  }
  const noRegion = kept.filter((r) => !r.region).length;

  const file = `scripts/out/highlights-${COUNTRY}.ndjson`;
  writeFileSync(file, kept.map((r) => JSON.stringify(r)).join("\n") + "\n");
  console.log(
    `== klaar: ${kept.length} highlights → ${file} ` +
      `(buiten Europa: ${offshore}, ander land: ${wrongCountry}, zonder regio: ${noRegion}) ==`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
