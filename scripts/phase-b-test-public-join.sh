#!/bin/bash
set -euo pipefail
CODE="${1:-YTEEM9}"
FP="phone-test-$(date +%s)"
echo "PUBLIC join $CODE as $FP"
curl -sS -w "\nHTTP:%{http_code}\n" -X POST "https://kara2.4voice.ai/api/rooms/join" \
  -H 'content-type: application/json' \
  -d "{\"room_code\":\"${CODE}\",\"user_fingerprint\":\"${FP}\",\"display_name\":\"Phone\"}"
echo
# also state after
RID=$(curl -sS "https://kara2.4voice.ai/api/rooms/code/${CODE}" | python3 -c 'import json,sys; print(json.load(sys.stdin)["room"]["id"])')
curl -sS -w "\nHTTP:%{http_code}\n" "https://kara2.4voice.ai/api/rooms/${RID}/state" | head -c 300
echo
