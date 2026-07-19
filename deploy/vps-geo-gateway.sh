#!/bin/bash
# Expose brouter (:17777) + photon (:2322) via novactrl.nl/geo/* with a
# shared-secret header, so the Vercel app can reach them server-side.
#
# Run ON THE VPS as root:  bash vps-geo-gateway.sh
# Idempotent-ish: refuses to run twice (checks for existing /geo/ block).
#
# Afterwards set on Vercel (project outdoor-route-planner → Settings → Env):
#   GEO_ROUTE_BASE  = https://novactrl.nl/geo/route
#   GEO_SEARCH_BASE = https://novactrl.nl/geo/search
#   GEO_KEY         = <contents of /root/.geo-key>
set -euo pipefail

CONF=/etc/nginx/sites-enabled/novactrl.nl

if grep -q "location = /geo/route" "$CONF"; then
  echo "geo block already present in $CONF — nothing to do"
  exit 0
fi

KEY=$(openssl rand -hex 24)
echo -n "$KEY" > /root/.geo-key
chmod 600 /root/.geo-key

cp "$CONF" "/root/novactrl.nl.bak-geo-$(date +%s)"

python3 - << EOF
key = "$KEY"
p = "$CONF"
conf = open(p).read()
block = f"""    # Geo-services outdoor-route-planner (brouter/photon, localhost containers).
    # Alleen bereikbaar met X-Geo-Key; key staat in /root/.geo-key.
    location = /geo/route {{
        if (\$http_x_geo_key != "{key}") {{ return 403; }}
        proxy_pass http://127.0.0.1:17777/brouter;
        proxy_set_header Host \$host;
        proxy_read_timeout 60s;
    }}
    location = /geo/search {{
        if (\$http_x_geo_key != "{key}") {{ return 403; }}
        proxy_pass http://127.0.0.1:2322/api;
        proxy_set_header Host \$host;
    }}
    location = /geo/reverse {{
        if (\$http_x_geo_key != "{key}") {{ return 403; }}
        proxy_pass http://127.0.0.1:2322/reverse;
        proxy_set_header Host \$host;
    }}

    location / {{"""
assert conf.count("    location / {") == 1, "unexpected vhost shape — aborting"
conf = conf.replace("    location / {", block, 1)
open(p, "w").write(conf)
print("conf patched")
EOF

nginx -t
systemctl reload nginx
echo "OK — geo gateway live. Key: /root/.geo-key"
echo "Test: curl -H \"X-Geo-Key: \$(cat /root/.geo-key)\" 'https://novactrl.nl/geo/search?q=utrecht&limit=1'"
