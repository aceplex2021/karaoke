#!/bin/sh
set -eu

# ============================
# Karaoke Orphan Report Runner
# ============================
# - Runs orphan_report.js in a node container
# - Appends output to: /mnt/.../Karaoke/logs/orphan_report.log
# - READ-ONLY (no deletes, no DB writes)

LOG_DIR="/mnt/HomeServer/Media/Music/Karaoke/logs"
LOG_FILE="$LOG_DIR/orphan_report.log"

CONTROLLER_HOST="/mnt/HomeServer/Media/Music/Karaoke/Controller"
VIDEOS_HOST="/mnt/HomeServer/Media/Music/Karaoke/Videos"

: "${SUPABASE_URL:?SUPABASE_URL is required}"
: "${SUPABASE_SERVICE_ROLE_KEY:?SUPABASE_SERVICE_ROLE_KEY is required}"

mkdir -p "$LOG_DIR"

ts() { date "+%Y-%m-%d %H:%M:%S %Z"; }

echo "============================================================" >> "$LOG_FILE"
echo "🧾 ORPHAN REPORT START  $(ts)" >> "$LOG_FILE"

OUT="$(
  docker run --rm \
    -v "$CONTROLLER_HOST:/app" \
    -v "$VIDEOS_HOST:/karaoke/videos" \
    -w /app \
    -e KARAOKE_VIDEO_PATH=/karaoke/videos \
    -e SUPABASE_URL="$SUPABASE_URL" \
    -e SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
    -e MAX_SAMPLES="${MAX_SAMPLES:-50}" \
    -e PAGE_SIZE="${PAGE_SIZE:-1000}" \
    node:20-alpine sh -lc "npm i --silent @supabase/supabase-js >/dev/null 2>&1 && node orphan_report.js" \
  2>&1
)"

echo "$OUT" >> "$LOG_FILE"
echo "🧾 ORPHAN REPORT END    $(ts)" >> "$LOG_FILE"
