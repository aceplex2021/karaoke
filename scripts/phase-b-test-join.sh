#!/bin/bash
set -euo pipefail
CODE="${1:-YTEEM9}"
FP="join-test-$(date +%s)"
echo "Testing code=$CODE"
echo "=== get by code ==="
curl -sS "http://127.0.0.1:3000/api/rooms/code/${CODE}" | head -c 400
echo
echo "=== join ==="
curl -sS -X POST "http://127.0.0.1:3000/api/rooms/join" \
  -H 'content-type: application/json' \
  -d "{\"room_code\":\"${CODE}\",\"user_fingerprint\":\"${FP}\",\"display_name\":\"JoinTest\"}" \
  | head -c 500
echo
