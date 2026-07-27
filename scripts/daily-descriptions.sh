#!/bin/bash
# Dagelijkse highlight-beschrijvingen, lokaal via de Claude Code CLI.
#
# Waarom lokaal en niet als cloud-routine: een cloud-routine draait zonder
# toegang tot deze machine, zonder Supabase-connector en (blijkens de
# auto_disabled_repo_access op de oude IBKR-routine) zonder toegang tot deze
# private repo. Hij zou feiten ophalen, tekst schrijven en die nergens kwijt
# kunnen. Lokaal zijn de credentials er wél.
#
# Geen Anthropic-API-kosten: de tekst komt uit een `claude -p` sessie op het
# abonnement, niet uit een betaalde API-call.
#
# Handmatig draaien:  bash scripts/daily-descriptions.sh [aantal]
# Geplanned:          ~/Library/LaunchAgents/ai.tarnoo.descriptions.plist

set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

BATCH="${1:-25}"
LOG_DIR="scripts/out"
mkdir -p "$LOG_DIR"
LOG="$LOG_DIR/descriptions-$(date +%Y-%m-%d).log"
FACTS="$LOG_DIR/facts-today.json"
WRITE="$LOG_DIR/written-today.json"

exec >>"$LOG" 2>&1
echo "=== $(date '+%Y-%m-%d %H:%M:%S') — batch $BATCH ==="

# .env.local levert NEXT_PUBLIC_SUPABASE_URL / ANON_KEY / SERVICE_ROLE_KEY.
set -a
# shellcheck disable=SC1091
source .env.local
set +a

export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

# 1. Feiten ophalen (geen model, alleen Overpass + Wikipedia).
if ! npx tsx scripts/describe-highlights.ts --limit "$BATCH" > "$FACTS"; then
  echo "feiten ophalen mislukt — gestopt"
  exit 1
fi
COUNT=$(node -e "console.log((require('./$FACTS').items||[]).length)" 2>/dev/null || echo 0)
echo "kandidaten: $COUNT"
[ "$COUNT" -eq 0 ] && { echo "niets te doen"; exit 0; }

# 2. Claude schrijft de teksten. --print = headless, geen interactie.
#    Alleen Read/Write/Bash nodig; het model raakt de database niet zelf aan.
PROMPT=$(cat <<PROMPTEOF
Lees $FACTS. Voor elk item met "facts" en/of "wikipedia": schrijf een beschrijving van maximaal 2 zinnen in het Nederlands en in het Engels, voor iemand die een wandel- of fietsroute plant.

HARDE REGEL: gebruik uitsluitend wat in dat item staat. Geen jaartallen, namen, afstanden, hoogtes of gebeurtenissen die er niet letterlijk in staan. Weet je te weinig voor twee zinnen, schrijf er een. Liever kort dan verzonnen. Geen marketingtaal, geen uitroeptekens.

Items die alleen "reason" hebben neem je over met diezelfde reason.

Schrijf het resultaat naar $WRITE als {"items":[{"id":"...","nl":"...","en":"..."}]} - items zonder bron als {"id":"...","reason":"no_source"}. Draai daarna exact:
npx tsx scripts/describe-highlights.ts --write $WRITE
Antwoord daarna met een regel: hoeveel beschrijvingen je hebt geschreven.
PROMPTEOF
)

printf '%s' "$PROMPT" | claude --print --permission-mode acceptEdits \
  --allowedTools "Read" "Write" "Bash(npx tsx scripts/describe-highlights.ts --write*)" \
  || { echo "claude-run mislukt"; exit 1; }

echo "=== klaar $(date '+%H:%M:%S') ==="
