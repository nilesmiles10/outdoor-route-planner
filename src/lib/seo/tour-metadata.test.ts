import { describe, expect, it, vi } from "vitest";

// ─────────────────────────────────────────────────────────────────────────────
// P0-2d — de metadata-kant van "directe toegang tot een niet-publieke route".
//
// tour-access.test.ts dekt de status (harde 404) en de datalaag (getTour →
// null). Dit bestand dekt de laatste eis uit de privacy-opdracht: er mag ook
// géén metadata lekken — geen routenaam in <title>, geen omschrijving, geen
// OG/Twitter-tekst.
//
// page.tsx trekt via TourView maplibre-gl binnen, dat in node niet laadt.
// Daarom worden alleen de zware UI-imports gestubd; generateMetadata zelf
// draait ECHT, inclusief z'n eigen getTour-aanroep.
// ─────────────────────────────────────────────────────────────────────────────

const PRIVATE_ID = "22222222-2222-2222-2222-222222222222";
const SECRET_NAME = "Geheime trainingsronde";
const PUBLIC_ID = "11111111-1111-1111-1111-111111111111";
const PUBLIC_NAME = "Publieke rondrit";

const ROWS: Record<string, Record<string, unknown>> = {
  [PUBLIC_ID]: {
    id: PUBLIC_ID,
    name: PUBLIC_NAME,
    visibility: "public",
    sport: "touring",
    stats: { distanceM: 21500, timeS: 4200, ascendM: 120, descendM: 120 },
    surfaces: { buckets: { paved: 0.8, unpaved: 0.2, unknown: 0 } },
    profile: { display_name: "Iemand", avatar_url: null },
  },
  [PRIVATE_ID]: {
    id: PRIVATE_ID,
    name: SECRET_NAME,
    visibility: "private",
    stats: { distanceM: 9000, timeS: 1800, ascendM: 10, descendM: 10 },
  },
};

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  cache: <T,>(fn: T) => fn,
}));

// next-intl leunt op request-context (headers) die er in een node-test niet is.
// De vertaalfunctie geeft de sleutel terug; dat is genoeg — we toetsen op het
// ONTBREKEN van de routenaam, niet op de exacte copy.
vi.mock("next-intl/server", () => ({
  getTranslations: async () => Object.assign((k: string) => k, { rich: (k: string) => k }),
  setRequestLocale: () => {},
}));

// Zware UI-imports die niets met metadata te maken hebben.
vi.mock("@/components/TourView", () => ({ default: () => null }));
vi.mock("@/lib/weather", () => ({ getWeather: async () => null }));

vi.mock("@/lib/supabase/server", () => ({
  supabaseServer: () => ({
    from: () => {
      let id = "";
      const b: Record<string, unknown> = {};
      b.select = () => b;
      b.eq = (_c: string, v: string) => {
        id = v;
        return b;
      };
      // RLS: anoniem alleen publieke rijen.
      b.maybeSingle = () => {
        const row = ROWS[id];
        return Promise.resolve({ data: row?.visibility === "public" ? row : null });
      };
      return b;
    },
  }),
}));

async function metaFor(id: string) {
  const { generateMetadata } = await import("@/app/[locale]/tour/[id]/page");
  return generateMetadata({ params: { id, locale: "nl" } });
}

/** Alle tekst uit een Metadata-object, plat, om op lekken te kunnen zoeken. */
function allText(meta: unknown): string {
  return JSON.stringify(meta ?? {});
}

describe("metadata van een niet-publieke tour", () => {
  it("lekt de routenaam niet in de metadata", async () => {
    expect(allText(await metaFor(PRIVATE_ID))).not.toContain(SECRET_NAME);
  });

  it("zet geen omschrijving, OG of Twitter-tekst voor een privé-route", async () => {
    const meta = (await metaFor(PRIVATE_ID)) as Record<string, unknown>;
    expect(meta.description).toBeUndefined();
    expect(meta.openGraph).toBeUndefined();
    expect(meta.twitter).toBeUndefined();
  });

  it("zet geen canonical voor een privé-route (die bestaat publiek niet)", async () => {
    const meta = (await metaFor(PRIVATE_ID)) as Record<string, unknown>;
    expect(meta.alternates).toBeUndefined();
  });

  it("de publieke route krijgt wél volledige metadata", async () => {
    const text = allText(await metaFor(PUBLIC_ID));
    expect(text).toContain(PUBLIC_NAME);
    expect(text).toContain("canonical");
  });
});
