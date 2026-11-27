#!/bin/bash
set -euo pipefail
CODE=7XBV2Q
FP="pubjoin-$(date +%s)"
echo "public join $CODE"
curl -sS -w "\nHTTP:%{http_code}\n" -X POST "https://kara2.4voice.ai/api/rooms/join" \
  -H 'content-type: application/json' \
  -d "{\"room_code\":\"${CODE}\",\"user_fingerprint\":\"${FP}\",\"display_name\":\"PubJoin\"}" | head -c 400
echo
# room page HTML should be from kara2
curl -sS -o /dev/null -w "room_page:%{http_code}\n" "https://kara2.4voice.ai/room/${CODE}"
