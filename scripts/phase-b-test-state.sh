#!/bin/bash
set -euo pipefail
CODE="${1:-YTEEM9}"
ROOM=$(curl -sS "http://127.0.0.1:3000/api/rooms/code/${CODE}")
RID=$(python3 -c 'import json,sys; print(json.load(sys.stdin)["room"]["id"])' <<<"$ROOM")
echo "room_id=$RID"
echo "=== state ==="
curl -sS -w "\nHTTP:%{http_code}\n" "http://127.0.0.1:3000/api/rooms/${RID}/state" | head -c 800
echo
echo "=== docker logs ==="
cd /opt/kara2
docker compose logs web --tail 40 2>/dev/null | tail -40
