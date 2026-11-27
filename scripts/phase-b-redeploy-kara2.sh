#!/bin/bash
set -euo pipefail
pct exec 1005 -- bash -lc '
set -euo pipefail
cd /opt/kara2
# ensure DATABASE_URL present
grep -q "^DATABASE_URL=postgresql://" .env
docker compose up -d --build --remove-orphans
docker compose ps
# wait for health
for i in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:3000/ >/dev/null 2>&1; then
    echo WEB_UP
    break
  fi
  sleep 2
done
# confirm app sees local db (create room API smoke needs more; check env inside container)
docker compose exec -T web printenv DATABASE_URL | sed -E "s#://([^:/]+):([^@]+)@#://\1:***@#"
'
echo REDEPLOY_OK
