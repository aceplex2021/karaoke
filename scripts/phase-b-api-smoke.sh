#!/bin/bash
set -euo pipefail
# Smoke create-room against local kara2 web
FP="smoke-$(date +%s)"
RESP=$(curl -fsS -X POST http://127.0.0.1:3000/api/rooms/create \
  -H 'content-type: application/json' \
  -d "{\"room_name\":\"Phase B Smoke\",\"host_fingerprint\":\"${FP}\",\"host_display_name\":\"Smoke\",\"queue_mode\":\"fifo\",\"approval_mode\":\"auto\"}")
echo "$RESP" | python3 -c 'import sys,json; d=json.load(sys.stdin); assert d.get("room") or d.get("id") or d.get("room_code") or (d.get("data") and d["data"].get("room_code")); print("API_SMOKE_OK", json.dumps(d)[:300])'
