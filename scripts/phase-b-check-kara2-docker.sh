#!/bin/bash
set -euo pipefail
cd /opt/kara2
echo "=== docker ps -a ==="
docker ps -a --format 'table {{.ID}}\t{{.Names}}\t{{.Status}}'
echo "=== compose ps ==="
docker compose ps -a || true
