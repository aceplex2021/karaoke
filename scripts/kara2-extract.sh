#!/bin/bash
set -eu
rm -rf /opt/kara2
mkdir -p /opt/kara2
tar -xzf /tmp/kara2-deploy.tgz -C /opt/kara2
# .env pushed separately to /tmp/kara2.env
cp /tmp/kara2.env /opt/kara2/.env
chmod 600 /opt/kara2/.env
# cloudflared container must be able to read credentials (non-root)
chmod 644 /opt/kara2/cloudflared/credentials.json /opt/kara2/cloudflared/config.yml
rm -f /tmp/kara2-deploy.tgz /tmp/kara2.env /tmp/kara2-extract.sh
ls -la /opt/kara2
ls -la /opt/kara2/cloudflared
test -f /opt/kara2/Dockerfile
test -f /opt/kara2/package.json
test -f /opt/kara2/.env
test -f /opt/kara2/cloudflared/config.yml
test -f /opt/kara2/cloudflared/credentials.json
test -d /opt/kara2/src
test -d /opt/kara2/public
echo EXTRACT_OK
