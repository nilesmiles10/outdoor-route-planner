#!/bin/sh
# GEN-145 — Europa-queue: per land 3 sporten importeren + direct laden.
# Onbeheerd-robuust: een gefaald land/sport wordt gelogd en de queue
# vervolgt. Master-log = scripts/out/europe-queue.log (Monitor kijkt mee).
# Draaien: TRAILS_IMPORT_KEY=… nohup sh scripts/run-europe.sh &
set -u
cd "$(dirname "$0")/.."
MASTER="scripts/out/europe-queue.log"
: > "$MASTER"

# Buurlanden/outdoor-toppers eerst — waardevolste content landt het eerst.
COUNTRIES="BE DE AT CH FR GB IE DK SE NO FI PL CZ SK HU SI HR IT ES PT LU EE LV LT RO BG GR"

echo "QUEUE START $(date -u +%FT%TZ) — landen: $COUNTRIES" >> "$MASTER"
for C in $COUNTRIES; do
  for S in mtb hike touring; do
    LOG="scripts/out/run-$S-$C.log"
    echo "START $C $S $(date -u +%FT%TZ)" >> "$MASTER"
    if npx tsx scripts/import-trails.ts "$S" --country "$C" > "$LOG" 2>&1; then
      N=$(grep -m1 "^imported:" "$LOG" | grep -o '[0-9]*' | head -1)
      echo "IMPORT-OK $C $S: ${N:-0} routes" >> "$MASTER"
      if [ "${N:-0}" -gt 0 ]; then
        if TRAILS_IMPORT_KEY="$TRAILS_IMPORT_KEY" npx tsx scripts/load-trails.ts "$S" "$C" >> "$LOG" 2>&1; then
          echo "LOAD-OK $C $S" >> "$MASTER"
        else
          echo "LOAD-FAIL $C $S (zie $LOG)" >> "$MASTER"
        fi
      fi
    else
      echo "IMPORT-FAIL $C $S (zie $LOG)" >> "$MASTER"
    fi
  done
  echo "LAND-KLAAR $C $(date -u +%FT%TZ)" >> "$MASTER"
done
echo "QUEUE KLAAR $(date -u +%FT%TZ)" >> "$MASTER"
