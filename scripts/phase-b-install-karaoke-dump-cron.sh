#!/bin/bash
# Install karaoke pg_dump cron on this Proxmox host.
# Args: <ctid>
set -euo pipefail
CT="${1:?usage: phase-b-install-karaoke-dump-cron.sh <ctid>}"
SCRIPT_SRC="${2:-/tmp/pg_dump_karaoke_to_truenas.sh}"
INSTALL_DIR=/root/karaoke
mkdir -p "$INSTALL_DIR"
cp "$SCRIPT_SRC" "$INSTALL_DIR/pg_dump_karaoke_to_truenas.sh"
chmod 755 "$INSTALL_DIR/pg_dump_karaoke_to_truenas.sh"

cat > /etc/cron.d/karaoke-pg-dump <<EOF
# Karaoke DB nightly dump (standby only)
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
25 2 * * * root PG_DUMP_VMID=${CT} ${INSTALL_DIR}/pg_dump_karaoke_to_truenas.sh >> /var/log/pg_dump_karaoke.log 2>&1
EOF
chmod 644 /etc/cron.d/karaoke-pg-dump
echo "Installed karaoke dump cron for CT ${CT} on $(hostname)"
