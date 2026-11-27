#!/bin/bash
# Run on PVE-B host as root (or: ssh root@10.0.19.210 bash -s < thisfile)
# Requires: KARA_APP_PASSWORD env var matching karaoke/.env DATABASE_URL password
set -euo pipefail

VMID="${VMID:-1003}"
PASSWORD="${KARA_APP_PASSWORD:?KARA_APP_PASSWORD required}"

echo "=== pg_hba: allow kara_app from LAN ==="
pct exec "${VMID}" -- bash -lc "
HBA=/etc/postgresql/17/main/pg_hba.conf
CHANGED=0
for cidr in '10.0.19.0/24' '10.0.29.0/24'; do
  if ! grep -qE \"kara_app.*\${cidr}\" \"\${HBA}\" 2>/dev/null; then
    echo \"host    karaoke    kara_app    \${cidr}    scram-sha-256\" >> \"\${HBA}\"
    CHANGED=1
  fi
done
# Also allow connections that appear from HAProxy VIP / local
if ! grep -qE 'kara_app.*127.0.0.1' \"\${HBA}\" 2>/dev/null; then
  echo 'host    karaoke    kara_app    127.0.0.1/32    scram-sha-256' >> \"\${HBA}\"
  CHANGED=1
fi
if [[ \"\${CHANGED}\" = 1 ]]; then
  echo 'pg_hba updated; reloading postgres'
  # Prefer reload over restart to avoid trading blip
  su - postgres -c 'psql -c \"SELECT pg_reload_conf();\"' || systemctl reload postgresql || true
else
  echo 'pg_hba already has kara_app LAN rules'
fi
grep -E 'kara_app|trading' \"\${HBA}\" || true
"

echo "=== create role kara_app + database karaoke ==="
# Escape single quotes in password for SQL
PW_ESC=$(printf "%s" "${PASSWORD}" | sed "s/'/''/g")

pct exec "${VMID}" -- bash -lc "
su - postgres -c \"psql -v ON_ERROR_STOP=1\" <<'EOSQL'
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'kara_app') THEN
    CREATE ROLE kara_app LOGIN PASSWORD '${PW_ESC}';
  ELSE
    ALTER ROLE kara_app PASSWORD '${PW_ESC}';
  END IF;
END
\$\$;
SELECT 'CREATE DATABASE karaoke OWNER kara_app'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'karaoke')\\gexec
EOSQL
"

# The heredoc above won't expand PW_ESC inside single-quoted EOSQL on remote.
# Do role/db with env-passed python for reliable password handling:
pct exec "${VMID}" -- env PW="${PASSWORD}" python3 - <<'PY'
import os, subprocess, shlex
pw = os.environ["PW"].replace("'", "''")
sql = f"""
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'kara_app') THEN
    CREATE ROLE kara_app LOGIN PASSWORD '{pw}';
  ELSE
    ALTER ROLE kara_app PASSWORD '{pw}';
  END IF;
END
$$;
SELECT 'CREATE DATABASE karaoke OWNER kara_app'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'karaoke')\\gexec
"""
subprocess.run(["su", "-", "postgres", "-c", f"psql -v ON_ERROR_STOP=1 -c {shlex.quote(sql)}"], check=False)
# gexec needs interactive psql script — use separate commands
subprocess.run([
  "su", "-", "postgres", "-c",
  f"psql -v ON_ERROR_STOP=1 -c {shlex.quote(sql.split('SELECT')[0])}"
], check=True)
subprocess.run([
  "su", "-", "postgres", "-c",
  "psql -v ON_ERROR_STOP=1 -tc \"SELECT 1 FROM pg_database WHERE datname='karaoke'\" | grep -q 1 || createdb -O kara_app karaoke"
], check=True)
print("role+db ready")
PY

echo "=== verify ==="
pct exec "${VMID}" -- su - postgres -c "psql -tc \"SELECT datname FROM pg_database WHERE datname='karaoke';\""
pct exec "${VMID}" -- su - postgres -c "psql -tc \"SELECT rolname FROM pg_roles WHERE rolname='kara_app';\""
echo "=== done: apply schema next ==="
