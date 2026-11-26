#!/usr/bin/env bash
# Zero-downtime blue-green deploy with automatic rollback.
#
#   deploy/scripts/deploy.sh <TAG>
#
# 1. backup DB  2. pull images  3. run migrations (must be backward-compatible: expand → contract)
# 4. start the idle colour  5. wait for /health/ready  6. smoke test  7. switch nginx (graceful reload)
# 8. move the beat scheduler  9. keep old colour running for ROLLBACK_GRACE seconds, then stop it.
# Any failure before step 7 leaves traffic on the current colour untouched.
set -euo pipefail
cd "$(dirname "$0")/../.."

TAG="${1:?usage: deploy.sh <image-tag>}"
STATE=deploy/.state
mkdir -p "$STATE"
ACTIVE=$(cat "$STATE/active_color" 2>/dev/null || echo blue)
IDLE=$([ "$ACTIVE" = blue ] && echo green || echo blue)
PREV_TAG=$(cat "$STATE/active_tag" 2>/dev/null || echo "")
GRACE="${ROLLBACK_GRACE:-600}"
APP="docker compose -f deploy/docker-compose.app.yml"
INFRA="docker compose -f deploy/docker-compose.infra.yml --env-file .env"

log() { echo "[deploy $(date +%H:%M:%S)] $*"; }

log "active=$ACTIVE ($PREV_TAG) → deploying $TAG to $IDLE"

log "1/9 database backup"
deploy/scripts/backup.sh "pre-$TAG"

log "2/9 pull images"
COLOR=$IDLE TAG=$TAG $APP -p "man-$IDLE" pull -q

log "3/9 migrations"
COLOR=$IDLE TAG=$TAG $APP -p "man-$IDLE" run --rm --no-deps backend migrate

log "4/9 start $IDLE"
COLOR=$IDLE TAG=$TAG $APP -p "man-$IDLE" up -d --remove-orphans backend worker frontend

log "5/9 wait for readiness"
ok=0
for i in $(seq 1 40); do
  if docker run --rm --network man_net curlimages/curl:8.10.1 -fsS "http://backend-$IDLE:8000/api/v1/health/ready/" >/dev/null 2>&1; then ok=1; break; fi
  sleep 3
done
if [ "$ok" != 1 ]; then
  log "new colour never became ready — aborting, traffic stays on $ACTIVE"
  COLOR=$IDLE TAG=$TAG $APP -p "man-$IDLE" logs --tail 80 backend || true
  COLOR=$IDLE TAG=$TAG $APP -p "man-$IDLE" down
  exit 1
fi

log "6/9 smoke test"
deploy/scripts/smoke.sh "http://backend-$IDLE:8000" "http://frontend-$IDLE:3000" || {
  log "smoke test failed — aborting"; COLOR=$IDLE TAG=$TAG $APP -p "man-$IDLE" down; exit 1; }

log "7/9 switch traffic to $IDLE"
deploy/scripts/switch.sh "$IDLE"

log "8/9 move scheduler (celery beat)"
COLOR=$ACTIVE TAG=${PREV_TAG:-$TAG} $APP -p "man-$ACTIVE" --profile beat stop beat 2>/dev/null || true
COLOR=$IDLE TAG=$TAG $APP -p "man-$IDLE" --profile beat up -d beat

echo "$IDLE" > "$STATE/active_color"
echo "$TAG" > "$STATE/active_tag"
echo "$PREV_TAG" > "$STATE/previous_tag"
echo "$(date -Is) $TAG $IDLE" >> "$STATE/history"

log "9/9 watching new colour for ${GRACE}s; old colour $ACTIVE kept for instant rollback"
deadline=$(( $(date +%s) + GRACE ))
while [ "$(date +%s)" -lt "$deadline" ]; do
  if ! docker run --rm --network man_net curlimages/curl:8.10.1 -fsS "http://backend-$IDLE:8000/api/v1/health/ready/" >/dev/null 2>&1; then
    log "health check failing after switch — automatic rollback"
    deploy/scripts/rollback.sh
    exit 1
  fi
  sleep 15
done
log "stopping old colour $ACTIVE"
COLOR=$ACTIVE TAG=${PREV_TAG:-$TAG} $APP -p "man-$ACTIVE" stop backend worker frontend || true
log "done: $TAG live on $IDLE"
