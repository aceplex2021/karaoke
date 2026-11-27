#!/bin/bash
set -euo pipefail
cd /opt/kara2
docker compose exec -T web printenv | grep -E '^(DATABASE_URL|NEXT_PUBLIC_SUPABASE|SUPABASE_)' | sed -E 's/(KEY|URL)=.+/\1=***/; s#://([^:/]+):([^@]+)@#://\1:***@#'
