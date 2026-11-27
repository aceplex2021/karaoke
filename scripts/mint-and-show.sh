#!/bin/bash
set -euo pipefail
# Extract PAT from trading git remote without printing it
REMOTE=$(git -C /root/trading remote get-url origin)
PAT=$(python3 - <<'PY'
import subprocess
url = subprocess.check_output(["git","-C","/root/trading","remote","get-url","origin"], text=True).strip()
# https://user:TOKEN@github.com/...
cred = url.split("://",1)[1].split("@",1)[0]
print(cred.split(":",1)[1] if ":" in cred else "")
PY
)
export GH_PAT="$PAT"
export GITHUB_REPO=aceplex2021/karaoke
export TOKEN_OUT=/tmp/kara2-reg-token
python3 /tmp/mint-runner-token.py
# Also write PAT for git clone on kara2 (file mode 600); wiped after install
umask 077
printf '%s' "$PAT" > /tmp/kara2-gh-pat
wc -c /tmp/kara2-reg-token /tmp/kara2-gh-pat
