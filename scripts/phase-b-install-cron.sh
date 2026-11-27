#!/bin/bash
# Install hourly karaoke maintenance cron on a Proxmox host for a Patroni CT.
# Runs only when that CT is primary (pg_is_in_recovery = false).
set -euo pipefail
CT="${1:?usage: phase-b-install-cron.sh <ctid>}"
HOST=$(hostname)
CRON_FILE=/etc/cron.d/karaoke-phase-b-maintenance
cat > "$CRON_FILE" <<EOF
# Karaoke Phase B maintenance (expire rooms + stale participations)
# Host: ${HOST}  CT: ${CT}
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
15 * * * * root pct exec ${CT} -- su - postgres -c "psql -d karaoke -v ON_ERROR_STOP=1 -c \\"SELECT CASE WHEN pg_is_in_recovery() THEN 'skip' ELSE expire_old_rooms()::text END; SELECT CASE WHEN pg_is_in_recovery() THEN 'skip' ELSE cleanup_stale_participations()::text END;\\"" >> /var/log/karaoke-cron.log 2>&1
EOF
chmod 644 "$CRON_FILE"
echo "Installed $CRON_FILE on $HOST for CT $CT"
