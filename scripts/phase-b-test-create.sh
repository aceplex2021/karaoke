#!/bin/bash
set -euo pipefail
FP="host-create-$(date +%s)"
echo "CREATE via localhost"
RESP=$(curl -sS -X POST http://127.0.0.1:3000/api/rooms/create \
  -H 'content-type: application/json' \
  -d "{\"room_name\":\"DB Visibility Test\",\"host_fingerprint\":\"${FP}\",\"host_display_name\":\"Host\",\"queue_mode\":\"fifo\"}")
echo "$RESP" | head -c 400
echo
CODE=$(python3 -c 'import json,sys; print(json.load(sys.stdin)["room"]["room_code"])' <<<"$RESP")
echo "created_code=$CODE"
echo "=== web env DATABASE_URL host ==="
cd /opt/kara2
docker compose exec -T web printenv DATABASE_URL | sed -E 's#://([^:/]+):([^@]+)@#://\1:***@#'
echo "=== recent create logs ==="
docker compose logs web --tail 80 2>/dev/null | grep -E 'creat|Error|pg-admin|rooms' | tail -30
