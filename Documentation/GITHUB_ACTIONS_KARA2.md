# GitHub Actions — CI + kara2 deploy

## What exists

| Workflow | File | Runner | When |
|----------|------|--------|------|
| **CI** | `.github/workflows/ci.yml` | `ubuntu-latest` (GitHub-hosted) | Push/PR to `main` |
| **Deploy kara2** | `.github/workflows/deploy-kara2.yml` | Self-hosted label `kara2` | Push to `main` + manual |

View runs: https://github.com/aceplex2021/karaoke/actions

## Why deploy is self-hosted

`kara2` lives on LAN (`10.0.19.235` / PVE B). GitHub cloud runners cannot reach that network, so deploy uses a **self-hosted runner** on the LXC (same pattern as trading’s local deploy).

## Current status (2026-11-27)

| Piece | Status |
|-------|--------|
| CI workflow | Live — typecheck always; `next build` when Supabase secrets exist |
| Deploy workflow | Live |
| Self-hosted runner | **`karaoke-kara2`** on LXC 1005 (`10.0.19.235`), labels `kara2`, systemd enabled |
| `/opt/kara2` | Git clone of `main` (GitHub is source of truth / backup); `.env` + `cloudflared/credentials.json` stay local-only |

## One-time / optional secrets

Settings → Secrets and variables → Actions:

| Secret | Purpose |
|--------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Enable CI `next build` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Enable CI `next build` |
| `SUPABASE_SERVICE_ROLE_KEY` | Enable CI `next build` |
| `GH_PAT` | Optional PAT for private `git pull` on the LXC |

Optional variables: `NEXT_PUBLIC_COMMERCIAL_MODE`, `MEDIA_SERVER_URL`, `KARA2_REPO_PATH` (default `/opt/kara2`).

## Day-to-day flow (same idea as trading)

1. Develop / commit locally  
2. `git push origin main`  
3. GitHub stores the backup  
4. Self-hosted runner on kara2 pulls `main` and `docker compose up -d --build`  

Reinstall runner (if needed): `scripts/install-kara2-runner.sh` (see scripts; needs a fresh registration token).
