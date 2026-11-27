#!/bin/bash
set -eu
cp -f /tmp/kara2-sync/globals.css /opt/kara2/src/app/globals.css
cp -f /tmp/kara2-sync/tv-page.tsx /opt/kara2/src/app/tv/page.tsx
cp -f /tmp/kara2-sync/YouTubePlayer.tsx /opt/kara2/src/components/YouTubePlayer.tsx
chmod 644 /opt/kara2/cloudflared/credentials.json /opt/kara2/cloudflared/config.yml || true
cd /opt/kara2
docker compose up -d --build
docker ps
echo DEPLOY_OK