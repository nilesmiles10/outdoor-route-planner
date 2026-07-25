// GEN-115 — laadt scripts/out/highlights-<XX>.ndjson naar Supabase via de
// tijdelijke import-highlights edge function (service-role upsert op osm_id,
// ignoreDuplicates -> herhaald draaien is idempotent).
// Secret via env HIGHLIGHTS_IMPORT_KEY. Draaien:
//   HIGHLIGHTS_IMPORT_KEY=… npx tsx scripts/load-highlights.ts <XX>
//
// LET OP: de edge function is een tijdelijk seed-endpoint. Vervang hem door
// een 410-stub zodra de seed klaar is (zie import-trails-precedent).
import { readFileSync } from "node:fs";

const COUNTRY = (process.argv[2] ?? "").toUpperCase();
const KEY = process.env.HIGHLIGHTS_IMPORT_KEY;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!/^[A-Z]{2}$/.test(COUNTRY) || !KEY || !ANON) {
  console.error(
    "usage: HIGHLIGHTS_IMPORT_KEY=… NEXT_PUBLIC_SUPABASE_ANON_KEY=… npx tsx scripts/load-highlights.ts <XX>",
  );
  process.exit(1);
}
const URL_ = "https://ivpkstpkzbbrttkqaops.supabase.co/functions/v1/import-highlights";

async function main() {
  const file = `scripts/out/highlights-${COUNTRY}.ndjson`;
  const rows = readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
  if (rows.length === 0) {
    console.log(`load ${COUNTRY}: 0 rows, klaar`);
    return;
  }
  const B = 200;
  let inserted = 0;
  let received = 0;
  let fails = 0;
  for (let i = 0; i < rows.length; i += B) {
    const batch = rows.slice(i, i + B);
    try {
      const res = await fetch(URL_, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${ANON}`,
          "x-import-key": KEY!,
        },
        body: JSON.stringify(batch),
      });
      if (!res.ok) throw new Error(`${res.status}: ${(await res.text()).slice(0, 200)}`);
      const j = (await res.json()) as { inserted?: number; received?: number };
      inserted += j.inserted ?? 0;
      received += j.received ?? batch.length;
      console.log(`  batch ${Math.floor(i / B) + 1}: +${j.inserted ?? 0} (van ${batch.length})`);
    } catch (e) {
      fails++;
      console.log(`  batch ${Math.floor(i / B) + 1} FAILED: ${(e as Error).message}`);
      if (fails > 5) break;
      await new Promise((r) => setTimeout(r, 5000));
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  console.log(
    `load ${COUNTRY}: ${inserted} nieuw ingevoegd van ${received} aangeboden (${rows.length} in bestand), ${fails} failures`,
  );
  if (fails > 0) process.exit(2);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
