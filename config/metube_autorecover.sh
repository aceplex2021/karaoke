#!/usr/bin/env bash
set -euo pipefail

CONTAINER="ix-metube-metube-1"
STATE_DIR="/mnt/HomeServer/Media/Music/Karaoke/Videos/Incoming/.metube"
LOG="/mnt/HomeServer/Media/Music/Karaoke/Automation/logs/metube_autorecover.log"

ts() { date -Is; }

# check for dbm corruption in recent logs
if docker logs "$CONTAINER" --since 10m 2>&1 | grep -q "db type could not be determined"; then
  echo "[$(ts)] dbm corruption detected — recovering" | tee -a "$LOG"

  docker stop "$CONTAINER"

  if [[ -d "$STATE_DIR" ]]; then
    mv "$STATE_DIR" "${STATE_DIR}.bak-$(date +%s)"
  fi

  mkdir -p "$STATE_DIR"
  chown -R 568:568 "$STATE_DIR"
  chmod -R 775 "$STATE_DIR"

  docker start "$CONTAINER"

  echo "[$(ts)] MeTube state reset + restarted" | tee -a "$LOG"
fi
