#!/usr/bin/env python3
"""Append kara_app LAN rules to pg_hba and reload if possible."""
import os
import subprocess
import sys

CANDIDATES = [
    "/var/lib/postgresql/data/pg_hba.conf",
    "/etc/postgresql/17/main/pg_hba.conf",
]
path = next((p for p in CANDIDATES if os.path.exists(p)), None)
if not path:
    print("pg_hba not found", file=sys.stderr)
    sys.exit(1)

with open(path, "r", encoding="utf-8") as f:
    hba = f.read()

lines = []
for cidr in ("10.0.19.0/24", "10.0.29.0/24"):
    if f"kara_app    {cidr}" not in hba:
        lines.append(f"host    karaoke    kara_app    {cidr}    scram-sha-256\n")
if "kara_app    127.0.0.1/32" not in hba:
    lines.append("host    karaoke    kara_app    127.0.0.1/32    scram-sha-256\n")

if not lines:
    print("hba already ok", path)
    sys.exit(0)

with open(path, "a", encoding="utf-8") as f:
    f.write("\n# karaoke Phase B\n")
    f.writelines(lines)
print("hba updated", path)
for line in lines:
    print(" ", line.strip())

# reload if writable primary; ignore failure on standby
subprocess.run(
    ["su", "-", "postgres", "-c", "psql -c 'SELECT pg_reload_conf()'"],
    check=False,
)
