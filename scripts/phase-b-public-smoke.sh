#!/bin/bash
set -euo pipefail
FP="pub-smoke-$(date +%s)"
curl -fsS -X POST https://kara2.4voice.ai/api/rooms/create \
  -H 'content-type: application/json' \
  -d "{\"room_name\":\"Public Smoke\",\"host_fingerprint\":\"${FP}\",\"host_display_name\":\"Pub\",\"queue_mode\":\"fifo\"}" \
  | head -c 250
echo
echo PUBLIC_SMOKE_OK
