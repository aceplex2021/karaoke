#!/bin/bash
set -euo pipefail
pct push 1005 /tmp/kara2-reg-token /tmp/kara2-reg-token
pct push 1005 /tmp/kara2-gh-pat /tmp/kara2-gh-pat
pct push 1005 /tmp/install-kara2-runner.sh /tmp/install-kara2-runner.sh
pct exec 1005 -- chmod 600 /tmp/kara2-reg-token /tmp/kara2-gh-pat
pct exec 1005 -- chmod +x /tmp/install-kara2-runner.sh
pct exec 1005 -- sed -i 's/\r$//' /tmp/install-kara2-runner.sh
pct exec 1005 -- env REG_TOKEN="$(cat /tmp/kara2-reg-token)" GH_PAT="$(cat /tmp/kara2-gh-pat)" bash /tmp/install-kara2-runner.sh
rm -f /tmp/kara2-reg-token /tmp/kara2-gh-pat /tmp/install-kara2-runner.sh
pct exec 1005 -- rm -f /tmp/kara2-reg-token /tmp/kara2-gh-pat /tmp/install-kara2-runner.sh
echo PVE_INSTALL_DONE
