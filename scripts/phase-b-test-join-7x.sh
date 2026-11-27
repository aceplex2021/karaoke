#!/bin/bash
set -euo pipefail
CODE=7XBV2Q
FP="joinfail-$(date +%s)"
echo "join $CODE"
curl -sS -w "\nHTTP:%{http_code}\n" -X POST http://127.0.0.1:3000/api/rooms/join \
  -H 'content-type: application/json' \
  -d "{\"room_code\":\"${CODE}\",\"user_fingerprint\":\"${FP}\",\"display_name\":\"JoinProbe\"}"
echo
curl -sS -w "\nHTTP:%{http_code}\n" "http://127.0.0.1:3000/api/rooms/code/${CODE}"
echo
cd /opt/kara2
docker compose logs web --tail 30 2>/dev/null | grep -iE 'join|Error|pg-admin|expired' | tail -20 || true
