#!/bin/bash
set -e
CT="${1:?ct id}"
echo "HOST=$(hostname) CT=$CT"
pct exec "$CT" -- bash -lc '
python3 - <<'"'"'PY'"'"'
import os, yaml
p="/etc/patroni/patroni.yml"
if os.path.exists(p):
  c=yaml.safe_load(open(p))
  print("data_dir", c.get("postgresql",{}).get("data_dir"))
  hba=c.get("postgresql",{}).get("pg_hba")
  print("pg_hba_count", len(hba) if hba else 0)
  if hba:
    for line in hba:
      print("CFG:", line)
else:
  print("no /etc/patroni/patroni.yml")
for path in ["/var/lib/postgresql/data/pg_hba.conf","/etc/postgresql/17/main/pg_hba.conf"]:
  if os.path.exists(path):
    print("FILE", path)
    for line in open(path):
      if "kara" in line.lower():
        print(" ", line.strip())
PY
'
