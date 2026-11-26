#!/usr/bin/env bash
# Compressed custom-format dump; keeps the newest $KEEP files.
set -euo pipefail
cd "$(dirname "$0")/../.."
set -a; . ./.env; set +a
LABEL="${1:-manual}"
KEEP="${KEEP:-30}"
FILE="man-$(date +%Y%m%d-%H%M%S)-$LABEL.dump"
INFRA="docker compose -f deploy/docker-compose.infra.yml --env-file .env"
$INFRA exec -T postgres pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -Z 6 -f "/backups/$FILE"
echo "backup: deploy/backups/$FILE"
ls -1t deploy/backups/*.dump 2>/dev/null | tail -n +$((KEEP + 1)) | xargs -r rm -f --
