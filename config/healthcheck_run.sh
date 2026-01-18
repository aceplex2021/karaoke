#!/bin/sh
set -eu

# ============================================================
# Karaoke Healthcheck Runner (cron-safe)
# ============================================================
# - Runs healthcheck.js in a node container
# - Logs to /mnt/.../Karaoke/logs/healthcheck.log
# - NO auto-fix (report + suggestions only)
# ============================================================

# -------------------------
# Supabase credentials
# -------------------------
# Normalize NEXT_PUBLIC_* → internal vars
SUPABASE_URL="https://kddbyrxuvtqgumvndphi.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtkZGJ5cnh1dnRxZ3Vtdm5kcGhpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczNzMxODczMiwiZXhwIjoyMDUyODk0NzMyfQ.wUyUv9OKALw-SOSMav1kJfZNEZhBzQqjOkfC6fc-myA"

export SUPABASE_URL
export SUPABASE_SERVICE_ROLE_KEY

# Hard fail if missing (defensive)
: "${SUPABASE_URL:?SUPABASE_URL is required}"
: "${SUPABASE_SERVICE_ROLE_KEY:?SUPABASE_SERVICE_ROLE_KEY is required}"

# -------------------------
# Paths
# -------------------------
LOG_DIR="/mnt/HomeServer/Media/Music/Karaoke/logs"
LOG_FILE="$LOG_DIR/healthcheck.log"

CONTROLLER_HOST="/mnt/HomeServer/Media/Music/Karaoke/Controller"
VIDEOS_HOST="/mnt/HomeServer/Media/Music/Karaoke/Videos"

mkdir -p "$LOG_DIR"

ts() { date "+%Y-%m-%d %H:%M:%S %Z"; }

echo "============================================================" >> "$LOG_FILE"
echo "🎤 HEALTHCHECK START  $(ts)" >> "$LOG_FILE"

# -------------------------
# Run healthcheck
# -------------------------
OUT="$(
  docker run --rm \
    -v "$CONTROLLER_HOST:/app" \
    -v "$VIDEOS_HOST:/karaoke/videos" \
    -w /app \
    -e KARAOKE_VIDEO_PATH=/karaoke/videos \
    -e SUPABASE_URL="$SUPABASE_URL" \
    -e SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
    node:20-alpine sh -lc "
      npm i --silent @supabase/supabase-js >/dev/null 2>&1 &&
      node healthcheck.cjs
    " \
  2>&1
)"

echo "$OUT" >> "$LOG_FILE"

# -------------------------
# Parse signals
# -------------------------
DELTA="$(printf '%s\n' "$OUT" | awk -F':' '/Count delta \(DB - FS\):/{print $2; exit}')"
MISSING="$(printf '%s\n' "$OUT" | awk -F':' '/missing_on_disk:/{print $2; exit}')"

echo "" >> "$LOG_FILE"
echo "🛠 Suggested actions (NO auto-fix):" >> "$LOG_FILE"

# ---- Delta analysis
if [ -n "${DELTA:-}" ]; then
  if [ "$DELTA" -gt 0 ] 2>/dev/null; then
    echo "- DB has $DELTA more rows than /Videos files (DB→FS drift)." >> "$LOG_FILE"
    echo "  Likely: stale DB rows, legacy paths, manual deletes." >> "$LOG_FILE"
    echo "  Suggested fix: generate orphan report, delete ONLY confirmed stale rows." >> "$LOG_FILE"
  elif [ "$DELTA" -lt 0 ] 2>/dev/null; then
    POS=$((0-DELTA))
    echo "- /Videos has $POS more files than DB rows (FS→DB drift)." >> "$LOG_FILE"
    echo "  Likely: watcher downtime or DB write failure." >> "$LOG_FILE"
    echo "  Suggested fix: run karaoke-node scan with WRITE_DB=true." >> "$LOG_FILE"
  else
    echo "- Counts match (delta=0). ✅" >> "$LOG_FILE"
  fi
else
  echo "- Could not parse count delta (inspect raw output above)." >> "$LOG_FILE"
fi

# ---- Missing-on-disk analysis
if [ -n "${MISSING:-}" ]; then
  MNUM="$(echo "$MISSING" | awk '{print $1}' | tr -cd '0-9')"
  if [ -n "${MNUM:-}" ] && [ "$MNUM" -gt 0 ] 2>/dev/null; then
    echo "- missing_on_disk detected: $MNUM" >> "$LOG_FILE"
    echo "  Suggested fix: inspect sample IDs; resolve path normalization or delete stale rows." >> "$LOG_FILE"
  else
    echo "- missing_on_disk is 0. ✅" >> "$LOG_FI_
