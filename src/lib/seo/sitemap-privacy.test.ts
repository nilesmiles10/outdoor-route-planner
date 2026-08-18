import { describe, expect, it, vi, beforeEach } from "vitest";

// ─────────────────────────────────────────────────────────────────────────────
// Privacy-regressietest voor de hoofd-sitemap (P0-2, slice 1).
//
// Waarom een fake Supabase-client i.p.v. een pure unit-test op een helper:
// het risico dat we willen afdekken is dat een pagina-type VERGEET te
// filteren. Een test op een losse predicaat-functie bewijst dat niet — die
// blijft groen terwijl sitemap.ts de filter laat vallen. Deze fake voert
// daarom de ÉCHTE sitemap() uit en past alleen de `.eq()`-filters toe die de
// code zelf meestuurt. Laat sitemap.ts `.eq("visibility","public")` weg, dan
// komen de privé-rijen uit de fixture terug en faalt de test.
//
// Trails- en highlights-sitemaps zijn hier bewust niet gedekt: dat is
// officiële OSM-data zonder gebruikers-zichtbaarheid (geen visibility-kolom).
// ─────────────────────────────────────────────────────────────────────────────

const PUBLIC_TOUR = "11111111-1111-1111-1111-111111111111";
const PRIVATE_TOUR = "22222222-2222-2222-2222-222222222222";
const FOLLOWERS_TOUR = "33333333-3333-3333-3333-333333333333";
const CLOSE_FRIENDS_TOUR = "44444444-4444-4444-4444-444444444444";
const COMPLETED_TOUR = "55555555-5555-5555-5555-555555555555";

const PUBLIC_COLLECTION = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const PRIVATE_COLLECTION = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const EMPTY_PUBLIC_COLLECTION = "cccccccc-cccc-cccc-cccc-cccccccccccc";

const FIXTURES: Record<string, Record<string, unknown>[]> = {
  tours: [
    { id: PUBLIC_TOUR, visibility: "public", kind: "planned", updated_at: "2026-01-01" },
    { id: PRIVATE_TOUR, visibility: "private", kind: "planned", updated_at: "2026-01-01" },
    { id: FOLLOWERS_TOUR, visibility: "followers", kind: "planned", updated_at: "2026-01-01" },
    { id: CLOSE_FRIENDS_TOUR, visibility: "close_friends", kind: "planned", updated_at: "2026-01-01" },
    // Publiek maar een opgenomen activiteit, geen planbare route.
    { id: COMPLETED_TOUR, visibility: "public", kind: "completed", updated_at: "2026-01-01" },
  ],
  collections: [
    {
      id: PUBLIC_COLLECTION,
      visibility: "public",
      updated_at: "2026-01-01",
      collection_items: [{ tours: { id: PUBLIC_TOUR } }],
    },
    {
      id: PRIVATE_COLLECTION,
      visibility: "private",
      updated_at: "2026-01-01",
      collection_items: [{ tours: { id: PUBLIC_TOUR } }],
    },
    {
      // Publiek, maar RLS geeft 0 zichtbare leden-tours terug → noindex, dus
      // hoort niet in de sitemap (anders adverteert-ie een noindex-URL).
      id: EMPTY_PUBLIC_COLLECTION,
      visibility: "public",
      updated_at: "2026-01-01",
      collection_items: [{ tours: null }],
    },
  ],
  highlight_regions: [
    { region: "Veluwe", country: "NL", category: "viewpoint", n: 42 },
  ],
  pages: [],
};

/** Chainable fake die de meegestuurde `.eq()`-filters daadwerkelijk toepast. */
function fakeQuery(table: string) {
  let rows = [...(FIXTURES[table] ?? [])];
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  builder.select = chain;
  builder.order = chain;
  builder.gte = chain;
  builder.limit = chain;
  builder.range = chain;
  builder.eq = (col: string, val: unknown) => {
    rows = rows.filter((r) => r[col] === val);
    return builder;
  };
  // PromiseLike: sitemap.ts awaits de builder rechtstreeks.
  builder.then = (resolve: (v: { data: unknown[] }) => unknown) =>
    Promise.resolve({ data: rows }).then(resolve);
  return builder;
}

vi.mock("@/lib/supabase/server", () => ({
  supabaseServer: () => ({ from: (table: string) => fakeQuery(table) }),
}));

describe("hoofd-sitemap zichtbaarheid", () => {
  let urls: string[];

  beforeEach(async () => {
    const { default: sitemap } = await import("@/app/sitemap");
    urls = (await sitemap()).map((e) => e.url);
  });

  it("bevat de publieke, planbare route", () => {
    expect(urls.some((u) => u.includes(`/tour/${PUBLIC_TOUR}`))).toBe(true);
  });

  it.each([
    ["private", PRIVATE_TOUR],
    ["followers", FOLLOWERS_TOUR],
    ["close_friends", CLOSE_FRIENDS_TOUR],
  ])("sluit een %s-route uit", (_label, id) => {
    expect(urls.some((u) => u.includes(`/tour/${id}`))).toBe(false);
  });

  it("sluit een niet-publieke collectie uit", () => {
    expect(urls.some((u) => u.includes(`/collection/${PRIVATE_COLLECTION}`))).toBe(false);
  });

  it("sluit een publieke collectie zonder zichtbare routes uit (die is noindex)", () => {
    expect(urls.some((u) => u.includes(`/collection/${EMPTY_PUBLIC_COLLECTION}`))).toBe(
      false,
    );
  });

  it("bevat de publieke collectie mét een zichtbare route", () => {
    expect(urls.some((u) => u.includes(`/collection/${PUBLIC_COLLECTION}`))).toBe(true);
  });

  it("geen enkele niet-publieke id lekt in welke URL dan ook", () => {
    const leaked = [PRIVATE_TOUR, FOLLOWERS_TOUR, CLOSE_FRIENDS_TOUR, PRIVATE_COLLECTION]
      .filter((id) => urls.some((u) => u.includes(id)));
    expect(leaked).toEqual([]);
  });

  it("dekt beide locales voor publieke content", () => {
    expect(urls.filter((u) => u.includes(`/tour/${PUBLIC_TOUR}`)).length).toBe(2);
  });
});
