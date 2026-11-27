#!/bin/bash
# Add/update DATABASE_URL in /opt/kara2/.env (run on kara2 host or via pct exec).
set -euo pipefail
ENV_FILE="${1:-/opt/kara2/.env}"
NEW_URL="${2:?usage: phase-b-set-kara2-database-url.sh <envfile> <database_url>}"

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing $ENV_FILE" >&2
  exit 1
fi

python3 - "$ENV_FILE" "$NEW_URL" <<'PY'
import sys
path, url = sys.argv[1], sys.argv[2]
lines = open(path, encoding="utf-8").read().splitlines()
out = []
found = False
for line in lines:
    if line.startswith("DATABASE_URL="):
        out.append("DATABASE_URL=" + url)
        found = True
    else:
        out.append(line)
if not found:
    out.append("")
    out.append("# Phase B local Patroni")
    out.append("DATABASE_URL=" + url)
open(path, "w", encoding="utf-8").write("\n".join(out) + "\n")
print("UPDATED", path, "DATABASE_URL set")
PY
