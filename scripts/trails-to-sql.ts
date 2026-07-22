// GEN-145 — zet scripts/out/trails-<sport>.ndjson om in SQL-chunkbestanden
// (scripts/out/trails-<sport>-NNN.sql) voor upsert via Supabase execute_sql.
// Idempotent: ON CONFLICT (osm_id) DO UPDATE — re-runs verversen.
// Draaien: npx tsx scripts/trails-to-sql.ts <mtb|hike|touring>
import { readFileSync, writeFileSync } from "node:fs";

const SPORT = process.argv[2];
if (!SPORT) {
  console.error("usage: npx tsx scripts/trails-to-sql.ts <sport>");
  process.exit(1);
}

const rows = readFileSync(`scripts/out/trails-${SPORT}.ndjson`, "utf8")
  .split("\n")
  .filter(Boolean)
  .map((l) => JSON.parse(l));

const CHUNK = 20;
let files = 0;
for (let i = 0; i < rows.length; i += CHUNK) {
  const chunk = rows.slice(i, i + CHUNK);
  const payload = JSON.stringify(chunk).replace(/'/g, "''");
  const sql = `insert into public.trails
  (osm_id, name, sport, region, network, operator, roundtrip,
   geometry, elevation, stats, surfaces, waytypes, source_url)
select r.osm_id, r.name, r.sport, r.region, r.network, r.operator,
       coalesce(r.roundtrip, false),
       r.geometry, r.elevation, r.stats, r.surfaces, r.waytypes, r.source_url
from jsonb_to_recordset('${payload}'::jsonb) as r(
  osm_id bigint, name text, sport text, region text, network text,
  operator text, roundtrip boolean, geometry jsonb, elevation jsonb,
  stats jsonb, surfaces jsonb, waytypes jsonb, source_url text)
on conflict (osm_id) do update set
  name = excluded.name, sport = excluded.sport, region = excluded.region,
  network = excluded.network, operator = excluded.operator,
  roundtrip = excluded.roundtrip, geometry = excluded.geometry,
  elevation = excluded.elevation, stats = excluded.stats,
  surfaces = excluded.surfaces, waytypes = excluded.waytypes,
  source_url = excluded.source_url, updated_at = now();`;
  const name = `scripts/out/trails-${SPORT}-${String(files).padStart(3, "0")}.sql`;
  writeFileSync(name, sql);
  files++;
}
console.log(`${rows.length} rows → ${files} sql-chunks (scripts/out/trails-${SPORT}-*.sql)`);
