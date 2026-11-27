#!/bin/bash
# Restore FULL pg_hba in Patroni DCS (trading + replication + karaoke).
set -euo pipefail
CT="${1:-113}"
pct exec "$CT" -- bash -lc '
set -euo pipefail
TMP=$(mktemp)
patronictl -c /etc/patroni/patroni.yml show-config > "$TMP"
python3 - "$TMP" <<'"'"'PY'"'"'
import sys, yaml
path = sys.argv[1]
with open(path) as f:
    cfg = yaml.safe_load(f) or {}
pg = cfg.setdefault("postgresql", {})
# Full authoritative list (matches prior patroni.yml + karaoke Phase B)
pg["pg_hba"] = [
    "local all all peer",
    "host all all 127.0.0.1/32 scram-sha-256",
    "host all all ::1/128 scram-sha-256",
    "host replication replicator 10.0.19.0/24 scram-sha-256",
    "host replication replicator 10.0.29.0/24 scram-sha-256",
    "host replication replicator 127.0.0.1/32 scram-sha-256",
    "host replication replicator ::1/128 scram-sha-256",
    "host trading trading 10.0.19.0/24 scram-sha-256",
    "host trading trading 10.0.29.0/24 scram-sha-256",
    "host karaoke kara_app 10.0.19.0/24 scram-sha-256",
    "host karaoke kara_app 10.0.29.0/24 scram-sha-256",
    "host karaoke kara_app 127.0.0.1/32 scram-sha-256",
]
with open(path, "w") as f:
    yaml.safe_dump(cfg, f, default_flow_style=False, sort_keys=False)
print("pg_hba entries", len(pg["pg_hba"]))
PY
patronictl -c /etc/patroni/patroni.yml edit-config --apply "$TMP" --force
rm -f "$TMP"
echo FULL_HBA_OK
'
