# GitHub Actions — CI + kara2 deploy

## What exists

| Workflow | File | Runner | When |
|----------|------|--------|------|
| **CI** | `.github/workflows/ci.yml` | `ubuntu-latest` (GitHub-hosted) | Push/PR to `main` |
| **Deploy kara2** | `.github/workflows/deploy-kara2.yml` | Self-hosted label `kara2` | Push to `main` + manual |

View runs: https://github.com/aceplex2021/karaoke/actions

## Why deploy is self-hosted

`kara2` lives on LAN (`10.0.19.235` / PVE B). GitHub cloud runners cannot reach that network, so deploy uses a **self-hosted runner** on the LXC (same pattern as trading’s local deploy).

## One-time setup

### 1. Repo secrets / variables (Settings → Secrets and variables → Actions)

**Secrets (CI build + private pull):**

| Name | Purpose |
|------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | CI `next build` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | CI `next build` |
| `SUPABASE_SERVICE_ROLE_KEY` | CI `next build` |
| `GH_PAT` | Optional PAT with `repo` read so the LXC can `git pull` if the repo is private |

**Variables (optional):**

| Name | Default |
|------|---------|
| `NEXT_PUBLIC_COMMERCIAL_MODE` | `true` |
| `MEDIA_SERVER_URL` | `https://media.4voice.ai` |
| `KARA2_REPO_PATH` | `/opt/kara2` |

### 2. Self-hosted runner on kara2 LXC (`10.0.19.235`)

On the LXC (as root):

1. GitHub → **Settings → Actions → Runners → New self-hosted runner** → Linux x64  
2. Follow the download / `./config.sh` prompts  
3. Labels: add **`kara2`** (required by the workflow)  
4. Install as service: `sudo ./svc.sh install && sudo ./svc.sh start`  
5. Confirm `/opt/kara2/.env` and `/opt/kara2/cloudflared/credentials.json` exist (from the original deploy)

### 3. Verify

1. Open https://github.com/aceplex2021/karaoke/actions — both workflows listed  
2. Push to `main` → **CI** should run green  
3. After the runner is online → **Deploy kara2** should rebuild compose on the LXC  

Until the self-hosted runner is registered, **Deploy kara2** stays queued (“Waiting for a runner…”). CI still works without it.
