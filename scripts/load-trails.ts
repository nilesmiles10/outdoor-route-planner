// GEN-145 — laadt scripts/out/trails-<sport>-<XX>.ndjson naar Supabase
// via de import-trails edge function (service-role upsert op osm_id).
// Secret via env TRAILS_IMPORT_KEY. Draaien:
//   TRAILS_IMPORT_KEY=… npx tsx scripts/load-trails.ts <sport> <XX>
import { readFileSync } from "node:fs";

const [SPORT, COUNTRY] = [process.argv[2], (process.argv[3] ?? "").toUpperCase()];
const KEY = process.env.TRAILS_IMPORT_KEY;
if (!SPORT || !/^[A-Z]{2}$/.test(COUNTRY) || !KEY) {
  console.error("usage: TRAILS_IMPORT_KEY=… npx tsx scripts/load-trails.ts <sport> <XX>");
  process.exit(1);
}
const URL = "https://ivpkstpkzbbrttkqaops.supabase.co/functions/v1/import-trails";

async function main() {
  const file = `scripts/out/trails-${SPORT}-${COUNTRY}.ndjson`;
  const rows = readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
  if (rows.length === 0) {
    console.log(`load ${SPORT} ${COUNTRY}: 0 rows, klaar`);
    return;
  }
  const B = 40;
  let ok = 0;
  let fails = 0;
  for (let i = 0; i < rows.length; i += B) {
    const batch = rows.slice(i, i + B);
    try {
      const res = await fetch(URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-import-key": KEY! },
        body: JSON.stringify(batch),
      });
      if (!res.ok) throw new Error(`${res.status}: ${(await res.text()).slice(0, 200)}`);
      ok += ((await res.json()) as { upserted?: number }).upserted ?? 0;
    } catch (e) {
      fails++;
      console.log(`  batch ${i / B + 1} FAILED: ${(e as Error).message}`);
      if (fails > 5) break;
      await new Promise((r) => setTimeout(r, 5000));
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  console.log(`load ${SPORT} ${COUNTRY}: ${ok}/${rows.length} upserted, ${fails} failures`);
  if (fails > 0 || ok < rows.length) process.exit(2);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
