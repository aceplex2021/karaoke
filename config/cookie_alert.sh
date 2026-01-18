#!/usr/bin/env bash
set -euo pipefail

#######################################
# CONFIG
#######################################
METUBE_CONTAINER="ix-metube-metube-1"

AUTOMATION_ROOT="/mnt/HomeServer/Media/Music/Karaoke/Automation"
LOG_DIR="$AUTOMATION_ROOT/logs"
LOCK_FILE="$LOG_DIR/.cookie_triggered"

WINDOW_SECONDS=30
MIN_HITS=3
COOLDOWN_SECONDS=300   # 5 minutes

#######################################
# PREP
#######################################
mkdir -p "$LOG_DIR"

echo "[$(date -Is)] cookie_alert.sh EXECUTED" \
  >> "$LOG_DIR/cookie_alert.log"

#######################################
# COOLDOWN CHECK
#######################################
if [[ -f "$LOCK_FILE" ]]; then
  LAST_TRIGGER=$(stat -c %Y "$LOCK_FILE")
  NOW=$(date +%s)
  (( NOW - LAST_TRIGGER < COOLDOWN_SECONDS )) && exit 0
  rm -f "$LOCK_FILE"
fi

#######################################
# COUNT AUTH ERRORS IN LAST WINDOW
#######################################
ERROR_COUNT=$(
  docker logs "$METUBE_CONTAINER" --since "${WINDOW_SECONDS}s" 2>&1 \
  | grep -aiE "cookies are no longer valid|confirm you|rate-limited by YouTube" \
  | wc -l || true
)

echo "[$(date -Is)] ERROR_COUNT(last ${WINDOW_SECONDS}s)=$ERROR_COUNT" \
  >> "$LOG_DIR/cookie_alert.log"

#######################################
# TRIGGER
#######################################
if (( ERROR_COUNT >= MIN_HITS )); then

    {
    echo "[$(date -Is)] COOKIE REFRESH TRIGGERED"
    echo "Hits: $ERROR_COUNT in last ${WINDOW_SECONDS}s"
  } >> "$LOG_DIR/cookie_alert.log"


  touch "$LOCK_FILE"
#####################################################################
# SSH to Ubuntu from Truenas
#####################################################################
  echo "[$(date -Is)] ABOUT TO SSH" >> "$LOG_DIR/cookie_alert.log"

ssh -o BatchMode=yes -o ConnectTimeout=5 aceonce2007@10.0.19.253 "~/yt-cookie-bot/run.sh" \
  >> "$LOG_DIR/cookie_alert.log" 2>&1

echo "[$(date -Is)] SSH RETURNED $? " >> "$LOG_DIR/cookie_alert.log"
####################################################################
# ---- SAFE LOG TRIM (keep ~last 30 minutes) ----
MAX_LINES=300

LINES=$(wc -l < "$LOG_DIR/cookie_alert.log" 2>/dev/null || echo 0)
if (( LINES > MAX_LINES )); then
  tail -n "$MAX_LINES" "$LOG_DIR/cookie_alert.log" > "$LOG_DIR/.cookie_alert.tmp"
  mv "$LOG_DIR/.cookie_alert.tmp" "$LOG_DIR/cookie_alert.log"

fi

fi
