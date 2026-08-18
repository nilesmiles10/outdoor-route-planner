import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// ─────────────────────────────────────────────────────────────────────────────
// P0-2b — "een nieuw pagina-type kan het zichtbaarheidsfilter niet vergeten".
//
// Dit is bewust een BRON-scan en geen runtime-test. Het risico dat we afdekken
// is dat iemand later een nieuwe publieke lijst-pagina toevoegt en simpelweg
// vergeet .eq("visibility","public") mee te geven. Een runtime-test dekt dat
// niet: die kent de nieuwe pagina niet.
//
// Werking: élke query op `tours` of `collections` in src/ moet geclassificeerd
// zijn. Publieke lijst-oppervlakken MOETEN filteren; al het andere staat met
// een expliciete reden in NOT_PUBLIC_LISTING. Een niet-geclassificeerd bestand
// laat deze test falen — de ontwikkelaar wordt dan gedwongen te kiezen, wat
// precies de bedoeling is.
//
// RLS (can_view_content) blijft de echte backstop; dit is de tweede laag, zodat
// een vergeten filter niet stil op RLS leunt en bij een RLS-wijziging lekt.
// ─────────────────────────────────────────────────────────────────────────────

const SRC = join(process.cwd(), "src");

/** Publiek indexeerbare lijsten: MOETEN expliciet op visibility filteren. */
const PUBLIC_LISTING: readonly string[] = [
  "app/sitemap.ts",
  "app/[locale]/discover/DiscoverClient.tsx",
  "app/[locale]/discover/page.tsx",
  "app/[locale]/collections/CollectionsClient.tsx",
  "app/[locale]/collections/page.tsx",
  "app/[locale]/highlight/[id]/page.tsx",
  "app/[locale]/tour/[id]/page.tsx",
];

/** Alles wat géén publieke lijst is — met reden. */
const NOT_PUBLIC_LISTING: Record<string, string> = {
  "app/[locale]/tour/[id]/data.ts":
    "enkele rij op id; RLS filtert, layout.tsx 404't op null (zie tour-access.test.ts)",
  "app/[locale]/tour/[id]/opengraph-image.tsx":
    "enkele rij op id; RLS filtert, geen lijst",
  "app/[locale]/collection/[id]/page.tsx":
    "enkele rij op id; RLS filtert, lege/niet-publieke collectie is noindex",
  "app/[locale]/collection/[id]/opengraph-image.tsx":
    "enkele rij op id; RLS filtert",
  "app/[locale]/collection/[id]/edit/page.tsx":
    "eigenaar-scherm achter auth; niet indexeerbaar",
  "app/[locale]/user/[id]/page.tsx":
    "profielpagina toont bewust de viewer-passende set via RLS (eigenaar ziet eigen privé)",
  "app/[locale]/feed/page.tsx":
    "ingelogde feed; RLS geeft followers-/close-friends-tier van followees, private nooit",
  "app/[locale]/routes/page.tsx": "eigen routes van de ingelogde gebruiker",
  "app/embed/[id]/page.tsx": "enkele rij op id; embed is noindex",
  "app/admin/page.tsx": "admin, noindex + nofollow",
  "app/admin/tours/page.tsx": "admin, noindex",
  "app/admin/collections/page.tsx": "admin, noindex",
  "app/admin/reports/page.tsx": "admin, noindex",
  "app/admin/users/[id]/page.tsx": "admin, noindex",
  "components/AccountPanel.tsx": "eigen account van de ingelogde gebruiker",
};

/**
 * Knipt elke query-keten op `tours`/`collections` uit een bronbestand.
 * Per keten, niet per bestand: /discover heeft twee tours-queries, en een
 * bestandsbrede check bleef groen toen één van de twee z'n filter verloor
 * (aangetoond met een mutatietest op 2026-08-18).
 *
 * Een keten loopt van `.from("…")` tot de eerstvolgende `.from(` of 500 tekens,
 * wat eerder komt. Schrijfpaden (.insert/.update/.delete vóór .select) tellen
 * niet mee: die lekken niets.
 */
function readChains(src: string): { chain: string; before: string }[] {
  const out: { chain: string; before: string }[] = [];
  // Twee vormen: de supabase-js builder .from("tours") én een kale REST-URL
  // (rest/v1/collections?...). Die tweede is toegevoegd nadat de server-wrapper
  // voor /collections precies zo'n fetch introduceerde en ongezien langs deze
  // guard glipte — een guard die de nieuwste query-vorm niet kent, dekt niets.
  const re =
    /\.from\("(?:tours|collections)"\)|rest\/v1\/(?:tours|collections)|\b(?:tours|collections)\?select=/g;
  for (let m = re.exec(src); m; m = re.exec(src)) {
    const start = m.index + m[0].length;
    const rest = src.slice(start, start + 500);
    // Knip bij de eerstvolgende query van WELKE vorm dan ook. Knippen op
    // alleen `.from(` liet /discover's eerste tours-query het filter van de
    // tweede meelezen, waardoor een verwijderd filter groen bleef (aangetoond
    // met een mutatietest op 2026-08-18).
    const next = rest.search(
      /\.from\("|rest\/v1\/(?:tours|collections)|\b(?:tours|collections)\?select=/,
    );
    const chain = next === -1 ? rest : rest.slice(0, next);
    const isRest = m[0].startsWith("rest/v1/") || m[0].includes("?select=");
    if (isRest) {
      // REST-lezen herken je aan select= in de querystring.
      if (!/select=/.test(m[0] + chain)) continue;
    } else {
      const sel = chain.search(/\.select\(/);
      if (sel === -1) continue; // geen leespad
      const write = chain.search(/\.(insert|update|delete|upsert)\(/);
      if (write !== -1 && write < sel) continue; // schrijfpad
    }
    out.push({ chain, before: src.slice(Math.max(0, m.index - 300), m.index) });
  }
  return out;
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

/** Bestanden die `tours` of `collections` bevragen (geen writes). */
function queryingFiles(): string[] {
  const hits: string[] = [];
  for (const abs of walk(SRC)) {
    if (!/\.(ts|tsx)$/.test(abs) || abs.endsWith(".test.ts")) continue;
    const src = readFileSync(abs, "utf8");
    // Geen eigen voorfilter meer: readChains kent beide query-vormen, en een
    // afwijkend voorfilter is precies hoe de REST-variant eerder onzichtbaar bleef.
    if (readChains(src).length) hits.push(relative(SRC, abs).split("\\").join("/"));
  }
  return hits.sort();
}

describe("zichtbaarheidsfilter op tours/collections-queries", () => {
  const files = queryingFiles();

  it("vindt de queries überhaupt (anders is de scan stuk)", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it("elk bestand met zo'n query is geclassificeerd", () => {
    const unclassified = files.filter(
      (f) => !PUBLIC_LISTING.includes(f) && !(f in NOT_PUBLIC_LISTING),
    );
    expect(
      unclassified,
      `Niet-geclassificeerde tours/collections-query gevonden. Voeg het bestand toe aan ` +
        `PUBLIC_LISTING (en filter op visibility) óf aan NOT_PUBLIC_LISTING mét reden.`,
    ).toEqual([]);
  });

  it.each(PUBLIC_LISTING)(
    "%s: ELKE tours/collections-leesquery filtert op zichtbaarheid",
    (f) => {
      const chains = readChains(readFileSync(join(SRC, f), "utf8"));
      expect(chains.length, "geen query gevonden — is het pad nog juist?").toBeGreaterThan(0);
      const unguarded = chains
        .map((c, i) => ({ i, c }))
        .filter(
          ({ c }) =>
            !/\.eq\(\s*"visibility",\s*"public"\s*\)/.test(c.chain) &&
            // Zelfde filter, maar in REST-vorm.
            !/visibility=eq\.public/.test(c.chain) &&
            // Eigenaar-gescopte query: kan per definitie niet breder lekken.
            !/\.eq\(\s*"owner"/.test(c.chain) &&
            !/owner=eq\./.test(c.chain) &&
            // Bewuste uitzondering, gemotiveerd bij de call-site zelf.
            !/seo-visibility-ok/.test(c.before),
        )
        .map(({ i }) => `keten #${i + 1}`);
      expect(
        unguarded,
        `Ongefilterde leesquery in een publiek lijst-oppervlak. Voeg ` +
          `.eq("visibility","public") toe, of motiveer 'm met een ` +
          `// seo-visibility-ok: <reden>-comment vlak boven de query.`,
      ).toEqual([]);
    },
  );

  it("elke NOT_PUBLIC_LISTING-uitzondering draagt een reden", () => {
    const empty = Object.entries(NOT_PUBLIC_LISTING)
      .filter(([, reason]) => reason.trim().length < 10)
      .map(([f]) => f);
    expect(empty).toEqual([]);
  });

  it("de allowlist bevat geen dode verwijzingen", () => {
    const known = new Set(files);
    const stale = PUBLIC_LISTING.concat(Object.keys(NOT_PUBLIC_LISTING)).filter(
      (f) => !known.has(f),
    );
    expect(stale, "verwijder deze uit de lijsten; ze bevragen niets meer").toEqual([]);
  });
});
