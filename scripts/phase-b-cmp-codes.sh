#!/bin/bash
set -euo pipefail
for CODE in 7XBC2Q 7XBV2Q; do
  echo "=== $CODE ==="
  curl -sS -o /tmp/out.json -w "HTTP:%{http_code}\n" "http://127.0.0.1:3000/api/rooms/code/$CODE"
  head -c 120 /tmp/out.json; echo
done