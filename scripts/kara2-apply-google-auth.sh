#!/bin/bash
# Deploy Google auth files to kara2 LXC 1005 (run from PVE host).
# Secrets must already be in /opt/kara2/.env — this script does NOT embed secrets.
set -euo pipefail
pct push 1005 /tmp/kara2-google-auth.tgz /tmp/kara2-google-auth.tgz
pct exec 1005 -- bash -lc '
set -euo pipefail
cd /opt/kara2
tar -xzf /tmp/kara2-google-auth.tgz
for key in NEXTAUTH_URL NEXTAUTH_SECRET GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET; do
  grep -q "^${key}=" .env || { echo "Missing $key in .env"; exit 1; }
done
grep -E "^(NEXTAUTH_URL|NEXTAUTH_SECRET|GOOGLE_CLIENT_ID|GOOGLE_CLIENT_SECRET)=" .env | sed "s/=.*/=***/"
docker compose up -d --build --force-recreate web
docker compose ps
echo DEPLOY_OK
'
