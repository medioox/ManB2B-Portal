#!/usr/bin/env bash
# Instant rollback: switch nginx back to the previous colour (still running during the grace period).
# If the previous colour was already stopped, it is started again from the previous image tag.
#   deploy/scripts/rollback.sh            → previous release
#   deploy/scripts/rollback.sh <TAG>      → any earlier release (full blue-green redeploy)
set -euo pipefail
cd "$(dirname "$0")/../.."
STATE=deploy/.state
if [ -n "${1:-}" ]; then exec deploy/scripts/deploy.sh "$1"; fi

ACTIVE=$(cat "$STATE/active_color")
PREV=$([ "$ACTIVE" = blue ] && echo green || echo blue)
PREV_TAG=$(cat "$STATE/previous_tag")
CUR_TAG=$(cat "$STATE/active_tag")
[ -n "$PREV_TAG" ] || { echo "no previous release recorded"; exit 1; }
APP="docker compose -f deploy/docker-compose.app.yml"

echo "[rollback] $CUR_TAG ($ACTIVE) → $PREV_TAG ($PREV)"
COLOR=$PREV TAG=$PREV_TAG $APP -p "man-$PREV" up -d backend worker frontend
for i in $(seq 1 40); do
  docker run --rm --network man_net curlimages/curl:8.10.1 -fsS "http://backend-$PREV:8000/api/v1/health/ready/" >/dev/null 2>&1 && break
  sleep 3
done
deploy/scripts/switch.sh "$PREV"
COLOR=$ACTIVE TAG=$CUR_TAG $APP -p "man-$ACTIVE" --profile beat stop beat || true
COLOR=$PREV TAG=$PREV_TAG $APP -p "man-$PREV" --profile beat up -d beat
echo "$PREV" > "$STATE/active_color"
echo "$PREV_TAG" > "$STATE/active_tag"
echo "$CUR_TAG" > "$STATE/previous_tag"
echo "$(date -Is) ROLLBACK $PREV_TAG $PREV" >> "$STATE/history"
echo "[rollback] done. Database schema is unchanged (migrations are additive)."
echo "           If a destructive migration must be undone: deploy/scripts/restore.sh <backup-file>"
