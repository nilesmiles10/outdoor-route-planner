import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// ─────────────────────────────────────────────────────────────────────────────
// P1-1, eerste plak — "een nieuwe route kan z'n canonical niet vergeten".
//
// De opdracht vraagt om één gedeelde SEO-laag. De onderliggende fout die zo'n
// laag moet voorkomen is concreet: een nieuw pagina-type dat zonder canonical
// (of zonder bewuste noindex) live gaat, waardoor elke ?utm-/?fbclid-variant
// een eigen URL met identieke inhoud wordt.
//
// Bewust eerst deze invariant en nog niet de refactor zelf: het verplaatsen van
// metadata-opbouw raakt ~8 route-bestanden waar de UX-agent gelijktijdig in
// werkt, en levert geen gedragsverandering op. De invariant vangt de fout nu al,
// tegen vrijwel geen botsingsrisico. Zie SEO_AUDIT.md P1-1 voor de rest.
//
// Regel: elke route onder src/app/[locale] die generateMetadata exporteert,
// moet óf een canonical zetten, óf zichzelf op noindex zetten, óf hier met
// reden zijn vrijgesteld.
// ─────────────────────────────────────────────────────────────────────────────

const APP = join(process.cwd(), "src", "app", "[locale]");

const EXEMPT: Record<string, string> = {
  "layout.tsx":
    "site-brede layout; een canonical hier zou op élke pagina naar de homepage wijzen",
  "reset-password/page.tsx":
    "auth-flow met token in de URL; geen indexeerbare inhoud en geen generateMetadata",
};

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

/** Routes die eigen metadata bouwen (page.tsx of layout.tsx). */
function metadataRoutes(): { rel: string; src: string }[] {
  return walk(APP)
    .filter((f) => /\/(page|layout)\.tsx$/.test(f))
    .map((f) => ({ rel: relative(APP, f).split("\\").join("/"), src: readFileSync(f, "utf8") }))
    .filter(({ src }) => /export\s+(async\s+)?function\s+generateMetadata|export\s+const\s+metadata/.test(src))
    .sort((a, b) => a.rel.localeCompare(b.rel));
}

// Twee manieren om aan de invariant te voldoen: de canonical zelf zetten, of
// 'm door de gedeelde entityMetadata()-helper laten zetten (die doet het altijd).
// Zonder die tweede vorm zou deze guard elke migratie naar de gedeelde laag
// als regressie melden, terwijl dat juist de gewenste richting is.
const hasCanonical = (src: string) =>
  /alternates:\s*\{[^}]*canonical/.test(src) || /entityMetadata\(/.test(src);
const selfNoindex = (src: string) => /robots:\s*(\{[^}]*index:\s*false|page\.noindex)/.test(src);

describe("canonical-invariant op indexeerbare routes", () => {
  const routes = metadataRoutes();

  it("vindt de routes überhaupt (anders is de scan stuk)", () => {
    expect(routes.length).toBeGreaterThan(5);
  });

  it("elke route met eigen metadata zet een canonical of staat op noindex", () => {
    const missing = routes
      .filter(({ rel }) => !(rel in EXEMPT))
      .filter(({ src }) => !hasCanonical(src) && !selfNoindex(src))
      .map(({ rel }) => rel);
    expect(
      missing,
      "Route bouwt eigen metadata maar zet geen canonical en geen noindex. " +
        "Voeg alternates.canonical toe, zet 'm op noindex, of neem 'm met reden op in EXEMPT.",
    ).toEqual([]);
  });

  it("elke vrijstelling draagt een reden", () => {
    const empty = Object.entries(EXEMPT)
      .filter(([, reason]) => reason.trim().length < 15)
      .map(([f]) => f);
    expect(empty).toEqual([]);
  });

  it("de vrijstellingslijst bevat geen dode verwijzingen", () => {
    const known = new Set(walk(APP).map((f) => relative(APP, f).split("\\").join("/")));
    const stale = Object.keys(EXEMPT).filter((f) => !known.has(f));
    expect(stale, "bestand bestaat niet meer; haal 'm uit EXEMPT").toEqual([]);
  });
});
