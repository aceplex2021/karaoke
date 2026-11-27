#!/bin/bash
# Nightly full dump of karaoke DB from local Patroni CT → TrueNAS.
# Install on BOTH pve (CT 1003) and pvetos (CT 113); each skips if node is not useful.
# Prefer dumping from sync standby when possible (less load on leader).
#
# Cron example:
#   25 2 * * * root /root/karaoke/pg_dump_karaoke_to_truenas.sh >> /var/log/pg_dump_karaoke.log 2>&1
set -euo pipefail

VMID="${PG_DUMP_VMID:?set PG_DUMP_VMID to 1003 or 113}"
DB="${PG_DUMP_DB:-karaoke}"
DEST="${PG_DUMP_DEST:-/mnt/truenas/trading/backups/pg}"
RETAIN_DAYS="${PG_DUMP_RETAIN_DAYS:-14}"
STAMP="$(date +%Y%m%d_%H%M%S)"

if ! pct status "${VMID}" 2>/dev/null | grep -q running; then
  echo "ERROR: LXC ${VMID} not running" >&2
  exit 1
fi

# Only dump from standby (or force with PG_DUMP_ALLOW_PRIMARY=1)
REC=$(pct exec "${VMID}" -- su - postgres -c "psql -Atc 'SELECT pg_is_in_recovery()'" | tr -d '[:space:]')
if [[ "${REC}" != "t" && "${PG_DUMP_ALLOW_PRIMARY:-0}" != "1" ]]; then
  echo "SKIP: CT ${VMID} is primary (set PG_DUMP_ALLOW_PRIMARY=1 to dump anyway)"
  exit 0
fi

mkdir -p "${DEST}"
OUT="${DEST}/karaoke_full_${STAMP}.dump"
echo "pg_dump full ${DB} from CT ${VMID} → ${OUT}"
pct exec "${VMID}" -- su - postgres -c "pg_dump -Fc -d ${DB} --no-owner --no-acl" > "${OUT}"
BYTES="$(wc -c < "${OUT}" | tr -d ' ')"
echo "Wrote ${OUT} (${BYTES} bytes)"
find "${DEST}" -maxdepth 1 -name 'karaoke_*.dump' -mtime +"${RETAIN_DAYS}" -delete 2>/dev/null || true
