#!/usr/bin/env bash
# Install GitHub Actions self-hosted runner on kara2 LXC.
# Requires: REG_TOKEN env (registration token), optional GH_PAT for private git pull.
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/aceplex2021/karaoke}"
REPO_DIR="${REPO_DIR:-/opt/kara2}"
RUNNER_DIR="${RUNNER_DIR:-/opt/actions-runner}"
RUNNER_VERSION="${RUNNER_VERSION:-2.338.2}"
RUNNER_ARCH="${RUNNER_ARCH:-x64}"
RUNNER_NAME="${RUNNER_NAME:-karaoke-kara2}"
REG_TOKEN="${REG_TOKEN:?set REG_TOKEN}"

echo "[kara2] hostname=$(hostname) repo=$REPO_DIR runner=$RUNNER_DIR"

# --- Ensure git present ---
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq git ca-certificates curl tar

# --- Convert /opt/kara2 into a git working tree, preserve secrets ---
mkdir -p "$REPO_DIR"
cd "$REPO_DIR"
preserve_env=0
preserve_creds=0
if [ -f .env ]; then
  cp -a .env /tmp/kara2.env.preserve
  preserve_env=1
fi
if [ -f cloudflared/credentials.json ]; then
  mkdir -p /tmp/kara2-cf-preserve
  cp -a cloudflared/credentials.json /tmp/kara2-cf-preserve/
  preserve_creds=1
fi

if [ ! -d .git ]; then
  echo "[kara2] Bootstrapping git clone into $REPO_DIR"
  rm -rf /tmp/kara2-git-bootstrap
  if [ -n "${GH_PAT:-}" ]; then
    git clone "https://x-access-token:${GH_PAT}@github.com/aceplex2021/karaoke.git" /tmp/kara2-git-bootstrap
  else
    git clone "https://github.com/aceplex2021/karaoke.git" /tmp/kara2-git-bootstrap
  fi
  # Replace tracked files with clone; keep untracked secrets via restore below
  shopt -s dotglob
  # Remove old non-secret tree files then copy clone
  find "$REPO_DIR" -mindepth 1 -maxdepth 1 ! -name '.env' ! -name 'cloudflared' -exec rm -rf {} +
  cp -a /tmp/kara2-git-bootstrap/. "$REPO_DIR/"
  rm -rf /tmp/kara2-git-bootstrap
else
  if [ -n "${GH_PAT:-}" ]; then
    git remote set-url origin "https://x-access-token:${GH_PAT}@github.com/aceplex2021/karaoke.git"
  fi
  git fetch origin main
  git reset --hard origin/main
fi

if [ "$preserve_env" = 1 ]; then
  cp -a /tmp/kara2.env.preserve "$REPO_DIR/.env"
  chmod 600 "$REPO_DIR/.env"
fi
if [ "$preserve_creds" = 1 ]; then
  mkdir -p "$REPO_DIR/cloudflared"
  cp -a /tmp/kara2-cf-preserve/credentials.json "$REPO_DIR/cloudflared/credentials.json"
  chmod 644 "$REPO_DIR/cloudflared/credentials.json"
fi
rm -f /tmp/kara2.env.preserve
rm -rf /tmp/kara2-cf-preserve

test -f "$REPO_DIR/.env"
test -f "$REPO_DIR/cloudflared/credentials.json"
echo "[kara2] git HEAD=$(git -C "$REPO_DIR" rev-parse --short HEAD)"

# --- Install actions runner ---
if [ -x "$RUNNER_DIR/config.sh" ]; then
  echo "[kara2] Removing existing runner config for clean install..."
  if [ -x "$RUNNER_DIR/svc.sh" ] && [ -f "$RUNNER_DIR/.service" ]; then
    "$RUNNER_DIR/svc.sh" stop || true
    "$RUNNER_DIR/svc.sh" uninstall || true
  fi
  cd "$RUNNER_DIR"
  ./config.sh remove --token "$REG_TOKEN" 2>/dev/null || true
  cd /
  rm -rf "$RUNNER_DIR"
fi

mkdir -p "$RUNNER_DIR"
cd "$RUNNER_DIR"
echo "[kara2] Downloading actions-runner v${RUNNER_VERSION}..."
curl -fsSL \
  "https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/actions-runner-linux-${RUNNER_ARCH}-${RUNNER_VERSION}.tar.gz" \
  -o runner.tar.gz
tar xzf runner.tar.gz
rm -f runner.tar.gz

export RUNNER_ALLOW_RUNASROOT=1
./config.sh \
  --url "$REPO_URL" \
  --token "$REG_TOKEN" \
  --name "$RUNNER_NAME" \
  --labels "kara2,self-hosted,linux,x64" \
  --work "_work" \
  --unattended \
  --replace

./svc.sh install
./svc.sh start
sleep 3
./svc.sh status || true

# Ensure docker usable
if ! docker info >/dev/null 2>&1; then
  echo "[kara2] WARNING: docker not reachable for root — check dockerd"
fi

echo "[kara2] RUNNER_INSTALL_OK name=$RUNNER_NAME labels=kara2"
