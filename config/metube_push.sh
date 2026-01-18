#!/usr/bin/env bash
set -euo pipefail

#######################################
# CONFIG (ABSOLUTE PATHS)
#######################################
BASE_DIR="/mnt/HomeServer/Media/Music/Karaoke"
AUTOMATION_DIR="$BASE_DIR/Automation"
CONFIG_DIR="$AUTOMATION_DIR/config"

METUBE_URL="http://localhost:30094/add"
SOURCES_FILE="$CONFIG_DIR/sources.txt"
LOG_DIR="$AUTOMATION_DIR/logs"

MAX_PUSH_PER_RUN=30
SLEEP_BETWEEN=5
QUALITY="best"

# Submission marker (AUTHORITATIVE)
LAST_SUBMIT_FILE="$LOG_DIR/.metube_last_submit"

#######################################
# SAFETY
#######################################
if [[ ! -f "$SOURCES_FILE" ]]; then
  echo "ERROR: sources.txt not found: $SOURCES_FILE" >&2
  exit 1
fi

mkdir -p "$LOG_DIR"

#######################################
# COOKIE ROTATION (ONCE PER RUN)
#######################################
COOKIE_FILE=$(ls "$CONFIG_DIR"/cookies*.txt 2>/dev/null | shuf -n1)

if [[ -z "$COOKIE_FILE" ]]; then
  echo "ERROR: No cookies*.txt found in $CONFIG_DIR" >&2
  exit 1
fi

#######################################
# RUNTIME
#######################################
TIMESTAMP="$(date '+%Y-%m-%d_%H-%M-%S')"
LOG_FILE="$LOG_DIR/metube_push-$TIMESTAMP.log"

echo "[$(date -Is)] Starting MeTube push" | tee -a "$LOG_FILE"
echo "[$(date -Is)] Using cookies: $(basename "$COOKIE_FILE")" | tee -a "$LOG_FILE"

COUNT=0
SUBMITTED=0

#######################################
# PROCESS SOURCES (NO SUBSHELL)
#######################################
while IFS= read -r raw_line; do
  # Trim whitespace
  line="$(echo "$raw_line" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"

  # Skip blanks
  [[ -z "$line" ]] && continue

  # Skip comments
  [[ "$line" =~ ^# ]] && continue

  # Strip inline comments
  line="${line%%#*}"
  line="$(echo "$line" | sed 's/[[:space:]]*$//')"
  [[ -z "$line" ]] && continue

  # Skip channel roots
  if [[ "$line" =~ youtube\.com/@[^/]+$ ]]; then
    echo "SKIP channel root: $line" | tee -a "$LOG_FILE"
    continue
  fi

  echo "POST -> $line" | tee -a "$LOG_FILE"

  if curl -fsS -X POST "$METUBE_URL" \
    -H "Content-Type: application/json" \
    -d "{
      \"url\":\"$line\",
      \"quality\":\"$QUALITY\",
      \"cookies\":\"$COOKIE_FILE\",
      \"ytdlp_options\":\"--extractor-args 'youtube:player_client=android,web'\"
    }" >> "$LOG_FILE" 2>&1; then
    SUBMITTED=$((SUBMITTED + 1))
  else
    echo "WARN: failed to submit $line" | tee -a "$LOG_FILE"
  fi

  COUNT=$((COUNT + 1))
  [[ "$COUNT" -ge "$MAX_PUSH_PER_RUN" ]] && break

  sleep "$SLEEP_BETWEEN"

done < <(sed 's/\r$//' "$SOURCES_FILE")

#######################################
# SUBMISSION MARKER (AUTHORITATIVE)
#######################################
if [[ "$SUBMITTED" -gt 0 ]]; then
  touch "$LAST_SUBMIT_FILE"
  echo "[$(date -Is)] Updated submission marker ($SUBMITTED URLs submitted)" \
    | tee -a "$LOG_FILE"
else
  echo "[$(date -Is)] No URLs submitted; marker not updated" \
    | tee -a "$LOG_FILE"
fi

echo "[$(date -Is)] Done. Pushed $COUNT URLs ($SUBMITTED successful)." \
  | tee -a "$LOG_FILE"
