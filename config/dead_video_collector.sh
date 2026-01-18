#!/usr/bin/env bash
set -euo pipefail

#######################################
# CONFIG
#######################################
BASE_DIR="/mnt/HomeServer/Media/Music/Karaoke"
AUTOMATION_ROOT="$BASE_DIR/Automation"
CONFIG_DIR="$AUTOMATION_ROOT/config"
LOG_DIR="$AUTOMATION_ROOT/logs"

METUBE_CONTAINER="ix-metube-metube-1"
DEAD_FILE="$CONFIG_DIR/dead_videos.txt"

LOOKBACK="24h"

mkdir -p "$CONFIG_DIR" "$LOG_DIR"
touch "$DEAD_FILE"

#######################################
# COLLECT DEAD VIDEO IDS (ROBUST)
#######################################
docker logs "$METUBE_CONTAINER" --since "$LOOKBACK" 2>&1 \
| grep -Ei "No video formats found|Video unavailable|private|not available in your country|copyright" \
| sed -nE 's/.*\[youtube\] ([A-Za-z0-9_-]{11}).*/\1/p' \
| sort -u \
| tee -a "$DEAD_FILE" >/dev/null

#######################################
# DEDUPE
#######################################
sort -u "$DEAD_FILE" -o "$DEAD_FILE"
