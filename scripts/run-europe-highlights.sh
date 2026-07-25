#!/bin/sh
# GEN-115 — seed point-highlights voor heel Europa (NL+BE zijn al gedaan).
# Draaien:
#   HIGHLIGHTS_IMPORT_KEY=… NEXT_PUBLIC_SUPABASE_ANON_KEY=… \
#     nohup sh scripts/run-europe-highlights.sh > scripts/out/europe-hl.log 2>&1 &
#
# Per land: import (Overpass → NDJSON) en meteen laden. Zo is de voortgang
# per land duurzaam en is her-runnen idempotent (osm_id UNIQUE + upsert
# ignoreDuplicates). Een land dat faalt stopt de queue niet.
#
# Volgorde: klein → groot. De kleintjes geven snel signaal over volume en
# kwaliteit voordat FR/DE/IT/ES uren gaan draaien.
set -u

COUNTRIES="LU IE DK CH AT CZ SK SI HR HU PT NO SE FI EE LV LT RO BG GR PL GB ES IT DE FR"

mkdir -p scripts/out
echo "== europe-highlights queue start $(date -u +%Y-%m-%dT%H:%M:%SZ) =="

for C in $COUNTRIES; do
  echo "START $C $(date -u +%Y-%m-%dT%H:%M:%SZ)"

  if npx tsx scripts/import-highlights.ts --country "$C" > "scripts/out/hl-$C.log" 2>&1; then
    KEPT=$(grep -o 'klaar: [0-9]*' "scripts/out/hl-$C.log" | head -1 | tr -d 'klaar: ')
    echo "IMPORT-OK $C: ${KEPT:-?} highlights"
  else
    echo "IMPORT-FAIL $C (zie scripts/out/hl-$C.log)"
    continue
  fi

  if npx tsx scripts/load-highlights.ts "$C" >> "scripts/out/hl-$C.log" 2>&1; then
    echo "LOAD-OK $C: $(grep -o '[0-9]* nieuw ingevoegd' "scripts/out/hl-$C.log" | tail -1)"
  else
    echo "LOAD-FAIL $C (zie scripts/out/hl-$C.log)"
  fi

  echo "LAND-KLAAR $C $(date -u +%Y-%m-%dT%H:%M:%SZ)"
done

echo "== europe-highlights queue klaar $(date -u +%Y-%m-%dT%H:%M:%SZ) =="
echo "!! VERGEET NIET: import-highlights edge function terugzetten op de 410-stub !!"
