#!/usr/bin/env bash
# Minimal post-deploy checks against the new colour before it receives traffic.
set -euo pipefail
API="${1:?backend url}"; WEB="${2:?frontend url}"
c() { docker run --rm --network man_net curlimages/curl:8.10.1 -fsS -o /dev/null -w "%{http_code}" "$@"; }
[ "$(c "$API/api/v1/health/ready/")" = 200 ]
[ "$(c "$API/api/v1/provinces/")" = 200 ]
[ "$(c -X POST -H 'content-type: application/json' -d '{}' "$API/api/v1/auth/login/" || true)" != 500 ]
[ "$(c "$WEB/login")" = 200 ]
echo "smoke ok"
