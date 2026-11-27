#!/bin/bash
set -euo pipefail
cd /opt/kara2
docker ps -a --format '{{.ID}} {{.Names}}' | grep -E 'kara2-web|5a277f' || true
docker rm -f $(docker ps -aq --filter name=kara2-web) 2>/dev/null || true
docker compose up -d --remove-orphans
docker compose ps
for i in $(seq 1 20); do
  if curl -fsS http://127.0.0.1:3000/ >/dev/null 2>&1; then
    echo WEB_OK
    exit 0
  fi
  sleep 2
done
echo WEB_FAIL
exit 1
