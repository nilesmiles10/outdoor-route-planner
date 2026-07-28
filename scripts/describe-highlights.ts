// Feiten verzamelen voor highlight-beschrijvingen. Schrijft zélf geen tekst.
//
// Draaien:
//   npx tsx scripts/describe-highlights.ts --fetch [--limit N] [--id <uuid>]
//
// Bewust géén Anthropic-API-call: de tekst wordt geschreven door de Claude
// Code-routine die dit script aanroept, niet door een betaalde API-call. Dit
// script doet alleen het domme werk — kandidaten zoeken, OSM-tags ophalen,
// Wikipedia-intro ophalen — en print een JSON-factsheet op stdout.
//
// De routine leest die factsheet, schrijft 2 zinnen NL + EN per highlight en
// zet ze weg via de Supabase MCP (execute_sql). Daarom heeft dit script geen
// service-role key nodig: alleen de publieke anon key om te lezen.
//
// De poort zit hier: een highlight komt alleen door als er iets WAARS over te
// zeggen valt — een Wikipedia-artikel, óf harde OSM-feiten (bouwjaar, type
// monument, hoogte, erfgoedstatus). Zonder dat komt hij terug als
// reason:"no_source" en zet de routine describe_status='no_source', zodat hij
// nooit opnieuw langskomt.
//
// Alleen wikipedia eisen bleek te streng: Kasteel Huize Harmelen heeft geen
// artikel maar wél historic=castle + start_date=1415 — ruim genoeg voor één
// ware zin. Wat je NIET wilt is een kaal tourism=viewpoint zonder feiten;
// daar valt niets over te zeggen dan vulsel.

const LIMIT = (() => {
  const i = process.argv.indexOf("--limit");
  return i > 0 ? parseInt(process.argv[i + 1], 10) : 25;
})();
const ONLY = (() => {
  const i = process.argv.indexOf("--id");
  return i > 0 ? process.argv[i + 1] : null;
})();
// --write <bestand>: past geschreven teksten toe. Het bestand is
// {"items":[{"id","nl","en"}|{"id","reason":"no_source"}]} — precies wat de
// routine produceert na het lezen van de factsheet.
const WRITE = (() => {
  const i = process.argv.indexOf("--write");
  return i > 0 ? process.argv[i + 1] : null;
})();
// --cat <categorie>: alleen die categorie. Loont, want de trefkans verschilt
// enorm: monument en nature halen de poort meestal (start_date, historic,
// heritage), peak en viewpoint vrijwel nooit — die hebben zelden meer dan een
// hoogte. Ongefilterd was 2 van 30 bruikbaar; dat zijn 28 Overpass-lookups
// voor niets.
const CAT = (() => {
  const i = process.argv.indexOf("--cat");
  return i > 0 ? process.argv[i + 1] : null;
})();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const OVERPASS = [
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass-api.de/api/interpreter",
];

type Row = {
  id: string;
  name: string;
  category: string;
  region: string | null;
  country: string | null;
  osm_id: string;
};

async function readRows(): Promise<Row[]> {
  const filter = ONLY
    ? `&id=eq.${ONLY}`
    : `&describe_status=is.null&osm_id=not.is.null&kind=eq.point` +
      (CAT ? `&category=eq.${CAT}` : "") +
      `&limit=${LIMIT}`;
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/highlights?select=id,name,category,region,country,osm_id${filter}`,
    { headers: { apikey: ANON_KEY } },
  );
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as Row[];
}

async function fetchTags(ids: string[]): Promise<Map<string, Record<string, string>>> {
  const byType: Record<string, string[]> = { node: [], way: [], relation: [] };
  for (const id of ids) {
    const [t, n] = id.split("/");
    if (t && n && byType[t]) byType[t]!.push(n);
  }
  const parts = Object.entries(byType)
    .filter(([, n]) => n.length > 0)
    .map(([t, n]) => `${t}(id:${n.join(",")});`)
    .join("\n  ");
  const query = `[out:json][timeout:180];\n(\n  ${parts}\n);\nout tags;`;

  for (let attempt = 0; attempt < 6; attempt++) {
    const url = OVERPASS[attempt % OVERPASS.length]!;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "tarnoo-describe/1.0 (highlight descriptions; contact via repo)",
        },
        body: `data=${encodeURIComponent(query)}`,
      });
      const text = await res.text();
      if (text.trimStart().startsWith("{")) {
        const data = JSON.parse(text) as {
          elements?: { type: string; id: number; tags?: Record<string, string> }[];
        };
        const out = new Map<string, Record<string, string>>();
        for (const el of data.elements ?? []) out.set(`${el.type}/${el.id}`, el.tags ?? {});
        return out;
      }
      console.error(`  overpass non-JSON (poging ${attempt + 1})`);
    } catch (e) {
      console.error(`  overpass fout (poging ${attempt + 1}): ${(e as Error).message}`);
    }
    await new Promise((r) => setTimeout(r, attempt < 2 ? 5_000 : 30_000));
  }
  throw new Error("overpass: retries exhausted");
}

async function wikiExtract(
  tags: Record<string, string>,
): Promise<{ text: string; url: string } | null> {
  const candidates: [string, string][] = [];
  for (const [k, v] of Object.entries(tags)) {
    if (k === "wikipedia") {
      const m = v.match(/^([a-z-]+):(.+)$/);
      if (m?.[1] && m[2]) candidates.push([m[1], m[2]]);
    } else if (k.startsWith("wikipedia:")) {
      candidates.push([k.slice("wikipedia:".length), v]);
    }
  }
  // Nederlands eerst: dat levert de bruikbaarste bron voor de NL-tekst.
  candidates.sort((a, b) => (a[0] === "nl" ? -1 : b[0] === "nl" ? 1 : 0));

  for (const [lang, title] of candidates.slice(0, 2)) {
    try {
      const res = await fetch(
        `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
        { headers: { "User-Agent": "tarnoo-describe/1.0 (contact via repo)" } },
      );
      if (!res.ok) continue;
      const j = (await res.json()) as {
        extract?: string;
        content_urls?: { desktop?: { page?: string } };
      };
      if (j.extract && j.extract.length > 40) {
        return {
          text: j.extract.slice(0, 1200),
          url: j.content_urls?.desktop?.page ?? `https://${lang}.wikipedia.org/wiki/${title}`,
        };
      }
    } catch {
      /* volgende taal proberen */
    }
  }
  return null;
}

// Alleen tags die iets zeggen over wat je er ziet of waarom het bijzonder is.
const KEEP = [
  "ele", "historic", "building", "castle_type", "start_date", "heritage",
  "architect", "operator", "website", "url", "tourism", "natural", "waterway",
  "leisure", "access", "description", "inscription", "material", "species",
];

// Feiten die op zichzelf al een ware zin opleveren. Een kale tourism= of
// building= telt niet mee: "een gebouw" is geen beschrijving.
//
// `historic` staat hier wel in maar kwalificeert NIET in zijn eentje — zie
// SUPPORTING hieronder. historic=castle alleen levert "een kasteel in
// Overijssel", en categorie en regio staan al op de pagina; dat is geen
// beschrijving maar herhaling. Twickel is het pijnlijke voorbeeld: een
// bekend landgoed waar OSM precies één tag over heeft.
// `ele` staat er bewust NIET bij. Een naamloze heuvel met alleen een hoogte
// levert "een heuvel van 40 meter" op — waar, maar de hoogte tonen we al als
// gegeven op de pagina, dus de zin voegt niets toe. Met ele erin haalde 68%
// van een steekproef de poort, vrijwel allemaal van dat soort; zonder ele
// blijven de gevallen over waar echt iets te vertellen valt.
const STRONG = [
  "start_date", "historic", "heritage", "architect", "castle_type",
  "inscription", "description", "species", "material",
];

// Wat een highlight écht door de poort helpt: een feit dat meer zegt dan het
// type. `historic` ontbreekt hier bewust — die telt alleen mee in combinatie
// met een van deze.
const SUPPORTING = STRONG.filter((k) => k !== "historic");

type WriteItem = { id: string; nl?: string; en?: string; reason?: string };

// Terugschrijven vergt de service-role key: RLS blokkeert client-writes op
// highlights. Alleen dit pad gebruikt hem; het ophalen van feiten niet.
async function applyWrites(file: string) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY ontbreekt");
  // `vercel env pull` schrijft geheimen weg als de letterlijke tekst
  // [SENSITIVE]. Die passeert elke "is hij gezet?"-check en levert daarna bij
  // élke rij een 401 op. Hier hard stoppen, niet 25 keer falen.
  if (serviceKey === "[SENSITIVE]" || serviceKey.length < 20) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is een placeholder, geen sleutel. " +
        "Zet de echte sb_secret_… key uit Supabase (Settings > API Keys) in .env.local.",
    );
  }
  const { readFileSync } = await import("node:fs");
  const parsed = JSON.parse(readFileSync(file, "utf8")) as { items: WriteItem[] };
  let done = 0;
  let skipped = 0;
  let failed = 0;
  for (const it of parsed.items ?? []) {
    const body =
      it.reason === "no_source"
        ? { describe_status: "no_source", described_at: new Date().toISOString() }
        : {
            description_nl: it.nl,
            description_en: it.en,
            describe_status: "done",
            described_at: new Date().toISOString(),
          };
    if (it.reason !== "no_source" && (!it.nl || !it.en)) {
      console.error(`  overgeslagen (nl/en ontbreekt): ${it.id}`);
      failed++;
      continue;
    }
    const res = await fetch(`${SUPABASE_URL}/rest/v1/highlights?id=eq.${it.id}`, {
      method: "PATCH",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.error(`  FOUT ${it.id}: ${res.status} ${(await res.text()).slice(0, 120)}`);
      failed++;
      continue;
    }
    if (it.reason === "no_source") skipped++;
    else done++;
  }
  console.log(
    `weggeschreven: ${done} beschrijvingen, ${skipped} zonder bron, ${failed} mislukt`,
  );
  // Exit non-zero zodra er iets misging, óf als er items waren maar niets
  // is weggeschreven. Anders meldt de dagelijkse job succes terwijl er nul
  // rijen zijn bijgewerkt — precies hoe dit de eerste keer misging.
  if (failed > 0 || (parsed.items?.length > 0 && done + skipped === 0)) {
    process.exitCode = 2;
  }
}

async function main() {
  if (!SUPABASE_URL) throw new Error("SUPABASE env ontbreekt");
  if (WRITE) return applyWrites(WRITE);
  if (!ANON_KEY) throw new Error("SUPABASE anon key ontbreekt");
  const rows = await readRows();
  if (rows.length === 0) {
    console.log(JSON.stringify({ items: [] }, null, 2));
    return;
  }
  const tagMap = await fetchTags(rows.map((r) => r.osm_id));

  const items = [];
  for (const row of rows) {
    const tags = tagMap.get(row.osm_id) ?? {};
    const hasWikiTag =
      Boolean(tags.wikidata) || Object.keys(tags).some((k) => k.startsWith("wikipedia"));
    const strong = SUPPORTING.filter((k) => tags[k]);
    if (!hasWikiTag && strong.length === 0) {
      items.push({ id: row.id, name: row.name, reason: "no_source" });
      continue;
    }
    // Wikipedia is de rijkste bron maar niet de enige; harde tags volstaan.
    const wiki = hasWikiTag ? await wikiExtract(tags) : null;
    if (!wiki && strong.length === 0) {
      items.push({ id: row.id, name: row.name, reason: "no_source" });
      continue;
    }
    items.push({
      id: row.id,
      name: row.name,
      category: row.category,
      region: row.region,
      country: row.country,
      facts: Object.fromEntries(KEEP.filter((k) => tags[k]).map((k) => [k, tags[k]])),
      ...(wiki ? { wikipedia: wiki.text, wikipedia_url: wiki.url } : {}),
    });
    await new Promise((r) => setTimeout(r, 200));
  }

  console.log(JSON.stringify({ items }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
