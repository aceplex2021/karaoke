#!/bin/bash
set -euo pipefail
cd /opt/kara2
echo "=== DATABASE_URL in container ==="
docker compose exec -T web printenv DATABASE_URL | sed -E 's#://([^:/]+):([^@]+)@#://\1:***@#' || echo 'MISSING'
echo "=== .env on host ==="
grep -E '^DATABASE_URL=' .env | sed -E 's#://([^:/]+):([^@]+)@#://\1:***@#' || echo 'MISSING in .env'
echo "=== create room ==="
FP="trace-$(date +%s)"
RESP=$(curl -sS -X POST http://127.0.0.1:3000/api/rooms/create \
  -H 'content-type: application/json' \
  -d "{\"room_name\":\"TraceCreate\",\"host_fingerprint\":\"${FP}\",\"host_display_name\":\"Trace\",\"queue_mode\":\"fifo\"}")
echo "$RESP" | head -c 500
echo
CODE=$(python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("room",{}).get("room_code",""))' <<<"$RESP")
echo "CODE=$CODE"
echo "=== recent web logs ==="
docker compose logs web --tail 50 2>/dev/null | tail -50
