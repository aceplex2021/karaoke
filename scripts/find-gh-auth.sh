#!/bin/bash
set -eu
echo "ENV_EXISTS=$(test -f /root/trading/.env && echo yes || echo no)"
if [ -f /root/trading/.env ]; then
  grep -E '^(FVG|GH_|GITHUB|PAT|TOKEN)' /root/trading/.env | cut -d= -f1 || true
fi
echo "REMOTE=$(git -C /root/trading remote get-url origin 2>/dev/null || true)"
echo "GITCREDS=$(test -f /root/.git-credentials && echo yes || echo no)"
if [ -f /opt/actions-runner/.runner ]; then
  echo "RUNNER_FILE:"
  cat /opt/actions-runner/.runner
fi
ls /opt/actions-runner 2>/dev/null | head
