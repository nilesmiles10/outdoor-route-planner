#!/bin/bash
# Zet een verse Hetzner CX43 (8 vCPU / 16 GB / 160 GB, Ubuntu 24.04) op als
# dedicated geocoder voor Tarnoo: Photon met de VOLLEDIGE Europa-index.
#
# Waarom een eigen bak: de gedeelde VPS heeft 7,7 GB RAM en draait ook de live
# trading-stack. Een Europa-import met een krappe heap liep daar op 19-08-2026
# vast met OutOfMemoryError na 27,5 mln documenten. Op 16 GB kan de import een
# ruime heap krijgen zonder iets anders te verdringen.
#
# Draaien ALS ROOT op de NIEUWE server:  bash geo-server-setup.sh
# Duurt uren (13 GB download + volledige import). Gebruik tmux/screen.
set -euo pipefail

PHOTON_VERSION="1.2.1"          # gelijk aan de bestaande installatie
DUMP_URL="https://download1.graphhopper.com/public/europe/photon-dump-europe-1.0-latest.jsonl.zst"
# 16 GB totaal: 8 GB heap voor de import laat ruim over voor OS + page cache.
# De import op de oude bak faalde met 2 GB — niet opnieuw te krap afstellen.
IMPORT_HEAP="8g"
SERVE_HEAP="6g"

echo "==> packages"
apt-get update -qq
apt-get install -y -qq docker.io zstd pbzip2 curl ufw

echo "==> photon jar"
mkdir -p /opt/photon
cd /opt/photon
[ -f "photon-${PHOTON_VERSION}.jar" ] || \
  curl -fSL -o "photon-${PHOTON_VERSION}.jar" \
    "https://github.com/komoot/photon/releases/download/${PHOTON_VERSION}/photon-${PHOTON_VERSION}.jar"

echo "==> europe dump (13 GB, duurt even)"
[ -f photon-dump-europe.jsonl.zst ] || curl -fSL -o photon-dump-europe.jsonl.zst "$DUMP_URL"
ls -lh photon-dump-europe.jsonl.zst

echo "==> import (volledig Europa, geen -country-codes filter)"
# Naar een APARTE dir importeren en pas daarna omzetten, zodat een mislukte of
# halve import nooit een werkende index sloopt. Kost tijdelijk extra schijf.
rm -rf /opt/photon-new && mkdir -p /opt/photon-new
zstd -d --stdout /opt/photon/photon-dump-europe.jsonl.zst \
 | docker run -i --rm --name photon-import \
     -v /opt/photon:/photon -v /opt/photon-new:/photon-new \
     eclipse-temurin:21-jre \
     java -Xmx${IMPORT_HEAP} -XX:+UseG1GC -jar "/photon/photon-${PHOTON_VERSION}.jar" \
       import -import-file - -data-dir /photon-new -j 4
echo "IMPORT_EXIT=$?"

echo "==> serve"
mv /opt/photon-new/photon_data /opt/photon/photon_data
rmdir /opt/photon-new
cat > /opt/photon/docker-compose.yml <<COMPOSE
services:
  photon:
    image: eclipse-temurin:21-jre
    container_name: photon
    restart: unless-stopped
    mem_limit: 8g
    command: java -Xmx${SERVE_HEAP} -XX:+UseG1GC -jar /photon/photon-${PHOTON_VERSION}.jar serve -data-dir /photon -listen-ip 0.0.0.0 -listen-port 2322
    volumes:
      - /opt/photon:/photon
    ports:
      - "127.0.0.1:2322:2322"
COMPOSE
cd /opt/photon && docker compose up -d

echo "==> firewall (alleen SSH + HTTPS naar buiten; photon blijft op localhost)"
ufw allow 22/tcp && ufw allow 80/tcp && ufw allow 443/tcp && ufw --force enable

echo
echo "KLAAR. Rooktest:"
echo "  curl -s 'http://127.0.0.1:2322/api?q=zermatt&limit=1'"
echo "  curl -s 'http://127.0.0.1:2322/api?q=chamonix&limit=1'"
echo "  curl -s 'http://127.0.0.1:2322/reverse?lon=7.7491&lat=46.0207'"
echo
echo "Daarna: nginx + certbot voor geo.tarnoo.com met X-Geo-Key (zie"
echo "deploy/vps-geo-gateway.sh voor het bestaande patroon), en op Vercel"
echo "GEO_SEARCH_BASE/GEO_REVERSE_BASE naar de nieuwe host wijzen."
