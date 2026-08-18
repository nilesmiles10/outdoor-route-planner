import { describe, expect, it, vi } from "vitest";

// ─────────────────────────────────────────────────────────────────────────────
// P0-2c — directe toegang tot niet-publieke routes.
//
// Twee lagen beschermen een niet-publieke tour:
//   1. Postgres-RLS: `tours_select USING can_view_content(owner, visibility)`.
//      Geverifieerd tegen de live DB (2026-08-18): een anonieme bezoeker
//      (auth.uid() IS NULL) haalt alleen `visibility='public'`-rijen van een
//      niet-geschorste eigenaar met `profiles.privacy='public'`. De
//      followers-/close_friends-takken vereisen alle een auth.uid()-match.
//   2. App-laag: getTour() geeft dan null, layout.tsx roept notFound() BOVEN
//      de Suspense-grens (anders soft-404: 200 met 404-UI).
//
// Deze test dekt laag 2 — de laag die wij kunnen breken. De fake simuleert
// RLS door precies te doen wat can_view_content voor een anonieme bezoeker
// doet. Haalt iemand de notFound()-guard weg, dan wordt deze test rood.
// ─────────────────────────────────────────────────────────────────────────────

const PUBLIC_TOUR = "11111111-1111-1111-1111-111111111111";
const ROWS: Record<string, { id: string; name: string; visibility: string }> = {
  [PUBLIC_TOUR]: { id: PUBLIC_TOUR, name: "Publieke route", visibility: "public" },
  "22222222-2222-2222-2222-222222222222": {
    id: "22222222-2222-2222-2222-222222222222",
    name: "Geheime trainingsronde",
    visibility: "private",
  },
  "33333333-3333-3333-3333-333333333333": {
    id: "33333333-3333-3333-3333-333333333333",
    name: "Alleen voor volgers",
    visibility: "followers",
  },
  "44444444-4444-4444-4444-444444444444": {
    id: "44444444-4444-4444-4444-444444444444",
    name: "Alleen close friends",
    visibility: "close_friends",
  },
};

/** Doet voor een anonieme bezoeker wat can_view_content() in Postgres doet. */
function anonVisible(id: string) {
  const row = ROWS[id];
  return row && row.visibility === "public" ? row : null;
}

// React's cache() bestaat alleen onder de react-server-conditie; in een kale
// node-testrun is het undefined. De identiteitsvariant is voor deze test
// equivalent: cache() dedupt alleen, het verandert geen gedrag.
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  cache: <T,>(fn: T) => fn,
}));

vi.mock("@/lib/supabase/server", () => ({
  supabaseServer: () => ({
    from: () => {
      let id = "";
      const b: Record<string, unknown> = {};
      b.select = () => b;
      b.eq = (_col: string, val: string) => {
        id = val;
        return b;
      };
      b.maybeSingle = () => Promise.resolve({ data: anonVisible(id) });
      return b;
    },
  }),
}));

const NON_PUBLIC = Object.values(ROWS).filter((r) => r.visibility !== "public");

describe("directe toegang tot een niet-publieke tour", () => {
  it("getTour geeft de publieke route wél terug", async () => {
    const { getTour } = await import("@/app/[locale]/tour/[id]/data");
    expect(await getTour(PUBLIC_TOUR)).not.toBeNull();
  });

  it.each(NON_PUBLIC.map((r) => [r.visibility, r.id, r.name]))(
    "getTour geeft null voor een %s-route",
    async (_vis, id) => {
      const { getTour } = await import("@/app/[locale]/tour/[id]/data");
      expect(await getTour(id as string)).toBeNull();
    },
  );

  it.each(NON_PUBLIC.map((r) => [r.visibility, r.id]))(
    "de layout 404't hard op een %s-route (geen soft-404)",
    async (_vis, id) => {
      const { default: TourLayout } = await import("@/app/[locale]/tour/[id]/layout");
      // notFound() gooit een NEXT_HTTP_ERROR_FALLBACK/NEXT_NOT_FOUND-digest.
      await expect(
        TourLayout({ children: null, params: { id: id as string, locale: "nl" } }),
      ).rejects.toThrowError();
    },
  );

  it("de layout laat een publieke route wél door", async () => {
    const { default: TourLayout } = await import("@/app/[locale]/tour/[id]/layout");
    await expect(
      TourLayout({ children: null, params: { id: PUBLIC_TOUR, locale: "nl" } }),
    ).resolves.toBeDefined();
  });

  it("geen enkele niet-publieke routenaam is via getTour te bereiken", async () => {
    const { getTour } = await import("@/app/[locale]/tour/[id]/data");
    const leaked: string[] = [];
    for (const r of NON_PUBLIC) {
      const t = await getTour(r.id);
      if (t) leaked.push(r.name);
    }
    expect(leaked).toEqual([]);
  });
});
