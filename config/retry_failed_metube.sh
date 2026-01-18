#!/usr/bin/env bash
set -euo pipefail

echo "### RETRY SCRIPT PATH: $0 ###" >> /tmp/which_retry_script.log


#######################################
# CONFIG
#######################################
BASE_DIR="/mnt/HomeServer/Media/Music/Karaoke"
AUTOMATION_ROOT="$BASE_DIR/Automation"
CONFIG_DIR="$AUTOMATION_ROOT/config"
LOG_DIR="$AUTOMATION_ROOT/logs"
ARCHIVE_FILE="$BASE_DIR/Archive/metube-archive.txt"

METUBE_CONTAINER="ix-metube-metube-1"
METUBE_ADD_URL="http://localhost:30094/add"

BATCH_SIZE=50
SLEEP_BETWEEN=7
IDLE_SECONDS=3600

DRY_RUN="${DRY_RUN:-0}"

LOCK_FILE="$LOG_DIR/.retry_failed.lock"
LAST_SUBMIT_FILE="$LOG_DIR/.metube_last_submit"

TMP_ALL_IDS="/tmp/metube_all_ids.txt"
TMP_OK_IDS="/tmp/metube_ok_ids.txt"
TMP_RETRY_IDS="/tmp/metube_retry_ids.txt"
TMP_RETRY_FILTERED="/tmp/metube_retry_filtered.txt"

DEAD_IDS_FILE="$CONFIG_DIR/dead_videos.txt"

RUN_TS="$(date '+%Y-%m-%d_%H-%M-%S')"
RUN_LOG="$LOG_DIR/retry-$RUN_TS.log"

mkdir -p "$LOG_DIR"

log() {
  echo "[$(date -Is)] $*" | tee -a "$RUN_LOG"
}

#######################################
# LOCK
#######################################
exec 9>"$LOCK_FILE"
flock -n 9 || exit 0

#######################################
# COOKIE FILE (STATIC – managed by cookie_alert)
#######################################
COOKIE_FILE="$CONFIG_DIR/cookies.txt"

[[ ! -s "$COOKIE_FILE" ]] && {
  log "ERROR: cookies.txt missing or empty"
  exit 1
}

log "Using cookies file: cookies.txt"

#######################################
# IDLE CHECK
#######################################
NOW=$(date +%s)
LAST_SUBMIT_TS=0
[[ -f "$LAST_SUBMIT_FILE" ]] && LAST_SUBMIT_TS=$(stat -c %Y "$LAST_SUBMIT_FILE")

SINCE_SUBMIT=$((NOW - LAST_SUBMIT_TS))
[[ "$SINCE_SUBMIT" -lt "$IDLE_SECONDS" ]] && exit 0

ACTIVE_PROCS=$(docker exec "$METUBE_CONTAINER" sh -c \
  'pgrep -af "yt-dlp|ffmpeg" | grep -v pgrep || true')
[[ -n "$ACTIVE_PROCS" ]] && exit 0

log "MeTube idle confirmed (${SINCE_SUBMIT}s)"

#######################################
# BUILD ALL VIDEO IDS
#######################################
docker exec "$METUBE_CONTAINER" sh -c '
yt-dlp --flat-playlist -i --print "%(id)s" $(grep -v "^#" /cookies/sources.txt)
' | sort -u > "$TMP_ALL_IDS"

TOTAL_IDS=$(wc -l < "$TMP_ALL_IDS")

#######################################
# BUILD ARCHIVE IDS
#######################################
sed 's/^youtube //' "$ARCHIVE_FILE" | sort -u > "$TMP_OK_IDS"
ARCHIVED=$(wc -l < "$TMP_OK_IDS")

#######################################
# STATUS
#######################################
REMAINING=$((TOTAL_IDS - ARCHIVED))
SUCCESS_PCT=$((ARCHIVED * 100 / TOTAL_IDS))

log "Status: ${SUCCESS_PCT}% success (${ARCHIVED}/${TOTAL_IDS}), ${REMAINING} remaining"

[[ "$REMAINING" -eq 0 ]] && exit 0

#######################################
# MAIN RETRY LOOP
#######################################
while true; do
  # All missing IDs
  comm -23 "$TMP_ALL_IDS" "$TMP_OK_IDS" > "$TMP_RETRY_IDS"

  # Remove dead videos
  if [[ -f "$DEAD_IDS_FILE" ]]; then
    grep -vF -f "$DEAD_IDS_FILE" "$TMP_RETRY_IDS" > "$TMP_RETRY_FILTERED"
  else
    cp "$TMP_RETRY_IDS" "$TMP_RETRY_FILTERED"
  fi

  RETRY_COUNT=$(wc -l < "$TMP_RETRY_FILTERED")
  [[ "$RETRY_COUNT" -eq 0 ]] && break

  log "Retry wave: $RETRY_COUNT remaining (dead videos excluded)"

  mapfile -t IDS < <(head -n "$BATCH_SIZE" "$TMP_RETRY_FILTERED")

  for ID in "${IDS[@]}"; do
    URL="https://www.youtube.com/watch?v=$ID"

    if [[ "$DRY_RUN" == "1" ]]; then
      log "DRY RUN → $URL"
    else
      log "Retry → $URL"
      curl -fsS -X POST "$METUBE_ADD_URL" \
        -H "Content-Type: application/json" \
        -d "{\"url\":\"$URL\",\"quality\":\"best\",\"cookies\":\"$COOKIE_FILE\",\"ytdlp_options\":\"--extractor-args 'youtube:player_client=android,web'\"}" || true
      sleep "$SLEEP_BETWEEN"
    fi
  done

  # refresh archive snapshot
  sed 's/^youtube //' "$ARCHIVE_FILE" | sort -u > "$TMP_OK_IDS"
done

touch "$LAST_SUBMIT_FILE"
log "Retry process complete"
