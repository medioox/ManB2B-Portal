#!/usr/bin/env bash
# Point nginx at a colour and reload gracefully (in-flight requests finish on the old workers).
set -euo pipefail
cd "$(dirname "$0")/../.."
COLOR="${1:?usage: switch.sh blue|green}"
CONF=deploy/nginx/upstream/active.conf
cp "$CONF" "$CONF.bak"
cat > "$CONF" <<CONF
# Managed by deploy/scripts/deploy.sh — do not edit by hand. Active: $COLOR
upstream backend  { server backend-$COLOR:8000 max_fails=3 fail_timeout=10s; keepalive 64; }
upstream frontend { server frontend-$COLOR:3000 max_fails=3 fail_timeout=10s; keepalive 32; }
CONF
INFRA="docker compose -f deploy/docker-compose.infra.yml --env-file .env"
if ! $INFRA exec -T nginx nginx -t; then
  cp "$CONF.bak" "$CONF"; echo "nginx config test failed; reverted"; exit 1
fi
$INFRA exec -T nginx nginx -s reload
echo "traffic → $COLOR"
