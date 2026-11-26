#!/usr/bin/env bash
# Restore a dump (last resort, e.g. after a bad destructive migration). Stops app writes first.
set -euo pipefail
cd "$(dirname "$0")/../.."
set -a; . ./.env; set +a
FILE="${1:?usage: restore.sh <file in deploy/backups>}"
read -r -p "Restore $FILE over database $POSTGRES_DB? type YES: " ok
[ "$ok" = YES ] || exit 1
ACTIVE=$(cat deploy/.state/active_color)
TAG=$(cat deploy/.state/active_tag)
APP="docker compose -f deploy/docker-compose.app.yml"
INFRA="docker compose -f deploy/docker-compose.infra.yml --env-file .env"
COLOR=$ACTIVE TAG=$TAG $APP -p "man-$ACTIVE" --profile beat stop backend worker beat
$INFRA exec -T postgres pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists "/backups/$(basename "$FILE")"
COLOR=$ACTIVE TAG=$TAG $APP -p "man-$ACTIVE" --profile beat up -d backend worker beat
echo "restored $FILE"
