// Gravel-segmenten uit OSM-ways (ODbL). Dry-run-first: dit script SCHRIJFT
// NIETS naar de database — het produceert NDJSON + statistiek zodat we eerst
// kunnen zien hoeveel en hoe goed het corpus is.
//
// Draaien: npx tsx scripts/import-gravel-segments.ts [--country NL] [--prov NL-UT] [--min-km 2]
//
// Waarom niet uit routerelaties zoals import-trails.ts: er bestaat geen
// OSM-feed voor "notable segments". Komoot's segmenten zijn user-generated en
// licentie-technisch geen bron. Wat we wél hebben is ondergrond-waarheid: een
// aaneengesloten reeks gravel-ways ís een gravelstuk.
//
// Pipeline: Overpass per provincie (out geom) → keten-opbouw over gedeelde
// eindpunten → lengte-gate → NDJSON + rapport. Laden is een aparte stap die
// pas gebouwd wordt als de cijfers goed zijn.

export {}; // module-scope: anders botsen main()/helpers met andere scripts

type LonLat = [number, number];
type Way = { id: number; coords: LonLat[]; tags: Record<string, string> };
type Chain = {
  coords: LonLat[];
  lengthM: number;
  wayIds: number[];
  names: string[];
  surfaces: string[];
};

const OVERPASS_MIRRORS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

// Ondergronden die op een gravelbike als gravel tellen. Bewust NIET
// ground/dirt/earth: die zijn in NL vaak modderige bospaden, en een segment
// dat je alleen in augustus kunt rijden is geen goed segment. Zand en modder
// zijn sowieso uitgesloten — zie de profiel-tuning van 2026-07-30.
const SURFACES = ["gravel", "fine_gravel", "compacted"];
const HIGHWAYS = ["track", "cycleway", "path", "bridleway", "unclassified"];

const NL_PROVINCES = [
  "NL-DR", "NL-FL", "NL-FR", "NL-GE", "NL-GR", "NL-LI",
  "NL-NB", "NL-NH", "NL-OV", "NL-UT", "NL-ZE", "NL-ZH",
];

const args = process.argv.slice(2);
const argVal = (flag: string, def: string) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1]! : def;
};
const MIN_M = parseFloat(argVal("--min-km", "2")) * 1000;
const ONLY_PROV = argVal("--prov", "");

function havM(a: LonLat, b: LonLat): number {
  const R = 6371000;
  const φ1 = (a[1] * Math.PI) / 180;
  const φ2 = (b[1] * Math.PI) / 180;
  const dφ = φ2 - φ1;
  const dλ = ((b[0] - a[0]) * Math.PI) / 180;
  const h =
    Math.sin(dφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function lengthM(coords: LonLat[]): number {
  let m = 0;
  for (let i = 1; i < coords.length; i++) m += havM(coords[i - 1]!, coords[i]!);
  return m;
}

async function overpass(body: string): Promise<Record<string, unknown>> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const url = OVERPASS_MIRRORS[attempt % OVERPASS_MIRRORS.length]!;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          // Zonder UA weigeren beide mirrors (kumi expliciet, .de met 406).
          "User-Agent": "tarnoo-import/1.0 (gravel segments; contact via repo)",
        },
        body: `data=${encodeURIComponent(body)}`,
      });
      const text = await res.text();
      if (text.trimStart().startsWith("{")) return JSON.parse(text);
      const snippet = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 200);
      console.log(`  overpass non-JSON (poging ${attempt + 1}): ${snippet}`);
    } catch (e) {
      // fetch zelf kan gooien (undici headers-timeout op zware queries) —
      // dat moet ook geretried worden, niet alleen een HTTP-foutpagina.
      console.log(`  overpass fetch faalde (poging ${attempt + 1}): ${String(e).slice(0, 120)}`);
    }
    await new Promise((r) => setTimeout(r, attempt < 2 ? 5_000 : 30_000));
  }
  throw new Error("overpass: retries exhausted");
}

function query(prov: string): string {
  const surf = SURFACES.join("|");
  const hw = HIGHWAYS.join("|");
  return `[out:json][timeout:300];
area["ISO3166-2"="${prov}"]->.c;
way["surface"~"^(${surf})$"]["highway"~"^(${hw})$"]["bicycle"!="no"]["access"!="private"]["access"!="no"](area.c);
out geom;`;
}

// --- ketens over gedeelde eindpunten -------------------------------------
// Ways delen exacte OSM-knopen, dus eindpunten matchen op ~0,5 m volstaat.
// Een keten groeit zolang er aan een uiteinde precies ÉÉN voortzetting is;
// bij een kruising met meerdere opties stoppen we — dat is een natuurlijke
// segmentgrens en voorkomt dat het hele netwerk één slang wordt.
const key = (p: LonLat) => `${p[0].toFixed(6)},${p[1].toFixed(6)}`;

// Exacte knoop-match is te streng: een gravelpad wordt in NL voortdurend
// onderbroken door een kruisende verharde weg, een brugje of 30 m klinkers bij
// een boerderij. Die tussenstukjes zitten niet in onze pool, dus de keten brak
// daar. Gemeten op Utrecht: 79% van de ketens was één enkele way en van 297,8
// km gravel bleef 30,8 km over. Daarom springen we over gaten tot GAP_TOL_M.
const GAP_TOL_M = 60;
// Grid van ~0,001° (70-110 m) om kandidaat-eindpunten te vinden zonder
// alles met alles te vergelijken.
const cell = (p: LonLat) => `${Math.round(p[0] * 1000)},${Math.round(p[1] * 1000)}`;

function buildChains(ways: Way[]): Chain[] {
  // eindpunt-index op grid-cel
  const grid = new Map<string, { way: number; p: LonLat }[]>();
  for (let i = 0; i < ways.length; i++) {
    const c = ways[i]!.coords;
    if (c.length < 2) continue;
    for (const p of [c[0]!, c[c.length - 1]!]) {
      const k = cell(p);
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k)!.push({ way: i, p });
    }
  }
  const used = new Set<number>();
  const chains: Chain[] = [];
  let bridged = 0;

  // Richting van a naar b in graden.
  const bearing = (a: LonLat, b: LonLat): number => {
    const φ1 = (a[1] * Math.PI) / 180, φ2 = (b[1] * Math.PI) / 180;
    const Δλ = ((b[0] - a[0]) * Math.PI) / 180;
    const y = Math.sin(Δλ) * Math.cos(φ2);
    const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
    return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  };
  const turn = (a: number, b: number) => Math.abs(((b - a + 540) % 360) - 180);
  // Zonder deze grens draait de keten bij een gat van <60 m zó de parallelle
  // way naast zich in en loopt terug: 7% van de segmenten was >25% retraced
  // (Bosweg 80%). Een echte voortzetting draait niet verder dan MAX_TURN.
  const MAX_TURN = 120;

  // Zoek de voortzetting aan een uiteinde: alle ongebruikte ways met een
  // eindpunt binnen GAP_TOL_M. Bij méér dan één kandidaat stoppen we — dat is
  // een kruising en dus een natuurlijke segmentgrens.
  const continuation = (p: LonLat, inBearing: number | null): { way: number; gapM: number } | null => {
    const [gx, gy] = cell(p).split(",").map(Number) as [number, number];
    const hits: { way: number; gapM: number }[] = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const e of grid.get(`${gx + dx},${gy + dy}`) ?? []) {
          if (used.has(e.way)) continue;
          const d = havM(p, e.p);
          if (d <= GAP_TOL_M && !hits.some((h) => h.way === e.way)) {
            hits.push({ way: e.way, gapM: d });
          }
        }
      }
    }
    // Kandidaten die terugdraaien vallen af vóór de uniciteitstest: een
    // parallelle way naast het eindpunt is geen kruising, hij is gewoon fout.
    const forward = hits.filter((h) => {
      if (inBearing === null) return true;
      const w = ways[h.way]!.coords;
      const near = havM(p, w[0]!) <= havM(p, w[w.length - 1]!) ? w : [...w].reverse();
      return turn(inBearing, bearing(near[0]!, near[1]!)) <= MAX_TURN;
    });
    if (forward.length !== 1) return null;
    if (forward[0]!.gapM > 1) bridged++;
    return forward[0]!;
  };

  for (let i = 0; i < ways.length; i++) {
    if (used.has(i) || ways[i]!.coords.length < 2) continue;
    used.add(i);
    let line = [...ways[i]!.coords];
    const wayIds = [ways[i]!.id];
    const tags = [ways[i]!.tags];

    // vooruit
    for (;;) {
      const tail = line[line.length - 1]!;
      const nxt = continuation(tail, line.length >= 2 ? bearing(line[line.length - 2]!, tail) : null);
      if (nxt === null) break;
      used.add(nxt.way);
      const w = ways[nxt.way]!;
      // oriënteer de way zó dat zijn dichtstbijzijnde uiteinde aansluit
      const c = havM(tail, w.coords[0]!) <= havM(tail, w.coords[w.coords.length - 1]!)
        ? w.coords : [...w.coords].reverse();
      line = line.concat(nxt.gapM <= 1 ? c.slice(1) : c);
      wayIds.push(w.id);
      tags.push(w.tags);
    }
    // achteruit
    for (;;) {
      // Achteruit lopen we tegen de rijrichting in, dus de inkomende richting
      // is die van punt 1 naar punt 0.
      const head = line[0]!;
      const prv = continuation(head, line.length >= 2 ? bearing(line[1]!, head) : null);
      if (prv === null) break;
      used.add(prv.way);
      const w = ways[prv.way]!;
      const c = havM(head, w.coords[w.coords.length - 1]!) <= havM(head, w.coords[0]!)
        ? w.coords : [...w.coords].reverse();
      line = (prv.gapM <= 1 ? c.slice(0, -1) : c).concat(line);
      wayIds.push(w.id);
      tags.push(w.tags);
    }

    const names = Array.from(new Set(tags.map((t) => t.name).filter(Boolean) as string[]));
    const surfaces = Array.from(new Set(tags.map((t) => t.surface).filter(Boolean) as string[]));
    chains.push({ coords: line, lengthM: lengthM(line), wayIds, names, surfaces });
  }
  return chains;
}

async function main() {
  const provs = ONLY_PROV ? [ONLY_PROV] : NL_PROVINCES;
  const all: (Chain & { prov: string })[] = [];
  let totalWays = 0;

  for (const prov of provs) {
    process.stdout.write(`${prov}: ophalen… `);
    const data = (await overpass(query(prov))) as {
      elements: { id: number; geometry?: { lon: number; lat: number }[]; tags?: Record<string, string> }[];
    };
    const ways: Way[] = (data.elements ?? [])
      .filter((e) => e.geometry && e.geometry.length >= 2)
      .map((e) => ({
        id: e.id,
        coords: e.geometry!.map((g) => [g.lon, g.lat] as LonLat),
        tags: e.tags ?? {},
      }));
    totalWays += ways.length;
    const chains = buildChains(ways).filter((c) => c.lengthM >= MIN_M);
    for (const c of chains) all.push({ ...c, prov });
    console.log(`${ways.length} ways → ${chains.length} segmenten >=${MIN_M / 1000} km`);
    await new Promise((r) => setTimeout(r, 2000)); // mirror-huisregels
  }

  // --- rapport ------------------------------------------------------------
  all.sort((a, b) => b.lengthM - a.lengthM);
  const km = (m: number) => (m / 1000).toFixed(1);
  const named = all.filter((c) => c.names.length > 0);
  console.log(`\n=== DRY RUN — er is niets weggeschreven ===`);
  console.log(`ways opgehaald   : ${totalWays}`);
  console.log(`segmenten >=${MIN_M / 1000} km: ${all.length}`);
  console.log(`totale lengte    : ${km(all.reduce((s, c) => s + c.lengthM, 0))} km`);
  console.log(`met OSM-naam     : ${named.length} (${Math.round((100 * named.length) / (all.length || 1))}%)`);
  const buckets = [2, 3, 5, 10, 20];
  for (let i = 0; i < buckets.length; i++) {
    const lo = buckets[i]! * 1000;
    const hi = (buckets[i + 1] ?? Infinity) * 1000;
    const n = all.filter((c) => c.lengthM >= lo && c.lengthM < hi).length;
    console.log(`  ${buckets[i]}${buckets[i + 1] ? `-${buckets[i + 1]}` : "+"} km: ${n}`);
  }
  console.log(`\nlangste 15:`);
  for (const c of all.slice(0, 15)) {
    console.log(`  ${km(c.lengthM).padStart(6)} km  ${c.prov}  ${c.surfaces.join(",")}  ${c.names[0] ?? "(naamloos)"}`);
  }

  const fs = await import("node:fs/promises");
  await fs.mkdir("scripts/out", { recursive: true });
  const path = `scripts/out/gravel-segments-${ONLY_PROV || "NL"}.ndjson`;
  await fs.writeFile(
    path,
    all.map((c) => JSON.stringify({
      prov: c.prov, lengthM: Math.round(c.lengthM), names: c.names,
      surfaces: c.surfaces, wayIds: c.wayIds, coords: c.coords,
    })).join("\n") + "\n",
  );
  console.log(`\nNDJSON: ${path}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
