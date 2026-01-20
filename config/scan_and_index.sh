#!/bin/sh
set -eu

# ============================================================
# Karaoke Full Scan & Index Runner
# ============================================================
# - Scans all video files in /Videos
# - Indexes missing files to database
# - Uses WRITE_DB=true to actually write to DB
# ============================================================

# -------------------------
# Supabase credentials
# -------------------------
SUPABASE_URL="https://kddbyrxuvtqgumvndphi.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtkZGJ5cnh1dnRxZ3Vtdm5kcGhpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczNzMxODczMiwiZXhwIjoyMDUyODk0NzMyfQ.wUyUv9OKALw-SOSMav1kJfZNEZhBzQqjOkfC6fc-myA"

export SUPABASE_URL
export SUPABASE_SERVICE_ROLE_KEY

# Hard fail if missing
: "${SUPABASE_URL:?SUPABASE_URL is required}"
: "${SUPABASE_SERVICE_ROLE_KEY:?SUPABASE_SERVICE_ROLE_KEY is required}"

# -------------------------
# Paths
# -------------------------
LOG_DIR="/mnt/HomeServer/Media/Music/Karaoke/Automation/logs"
LOG_FILE="$LOG_DIR/scan_$(date +%Y%m%d_%H%M%S).log"

CONTROLLER_HOST="/mnt/HomeServer/Media/Music/Karaoke/Controller"
VIDEOS_HOST="/mnt/HomeServer/Media/Music/Karaoke/Videos"

mkdir -p "$LOG_DIR"

ts() { date "+%Y-%m-%d %H:%M:%S %Z"; }

echo "============================================================" | tee -a "$LOG_FILE"
echo "🎤 SCAN & INDEX START  $(ts)" | tee -a "$LOG_FILE"
echo "============================================================" | tee -a "$LOG_FILE"

# -------------------------
# Run full scan with WRITE_DB=true
# -------------------------
docker run --rm \
  -v "$CONTROLLER_HOST:/app" \
  -v "$VIDEOS_HOST:/karaoke/videos" \
  -w /app \
  -e KARAOKE_VIDEO_PATH=/karaoke/videos \
  -e WRITE_DB=true \
  -e DEFAULT_LANGUAGE_CODE=vi \
  -e SUPABASE_URL="$SUPABASE_URL" \
  -e SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
  node:20-alpine sh -lc "
    echo '📦 Installing dependencies...' &&
    npm i --silent @supabase/supabase-js fast-glob remove-accents >/dev/null 2>&1 &&
    echo '🚀 Starting scan...' &&
    node -e \"import('./scanVideos.js').then(m => m.scanVideos())\"
  " 2>&1 | tee -a "$LOG_FILE"

echo "" | tee -a "$LOG_FILE"
echo "============================================================" | tee -a "$LOG_FILE"
echo "🎤 SCAN & INDEX END    $(ts)" | tee -a "$LOG_FILE"
echo "============================================================" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"
echo "📄 Full log saved to: $LOG_FILE" | tee -a "$LOG_FILE"
