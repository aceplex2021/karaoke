#!/bin/bash
set -euo pipefail
pct push 1005 /tmp/set-dburl.sh /tmp/set-dburl.sh
pct push 1005 /tmp/kara_database_url.txt /tmp/kara_database_url.txt
pct exec 1005 -- bash -lc '
set -euo pipefail
URL=$(tr -d "\r\n" </tmp/kara_database_url.txt)
bash /tmp/set-dburl.sh /opt/kara2/.env "$URL"
# mask password in print
python3 - <<PY
from pathlib import Path
import re
line=next(l for l in Path("/opt/kara2/.env").read_text().splitlines() if l.startswith("DATABASE_URL="))
print(re.sub(r"://([^:/]+):([^@]+)@", r://\1:***@", line))
PY
rm -f /tmp/kara_database_url.txt
'
echo KARA2_ENV_OK
