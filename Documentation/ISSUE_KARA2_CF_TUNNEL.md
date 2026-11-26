# INFRA — Publish Kara on PVE B via Cloudflare Tunnel

| Field | Value |
|-------|-------|
| **Issue ID** | `INFRA-KARA2-CF-TUNNEL-001` |
| **Status** | DEPLOYED + VERIFIED 2026-11-26 |
| **Created** | 2026-11-26 |
| **Hostname** | `kara2.4voice.ai` |
| **Host** | PVE B `10.0.19.210` — new LXC `kara2` |

## Problem

Local Windows `npm run dev` + ngrok is fragile for party use. Dead Vercel deploy at
`kara.4voice.ai` is not usable. Need a stable public HTTPS URL without Vercel or ngrok.

## Decision

- New dedicated Debian 12 LXC `kara2` on PVE B (do **not** touch stopped trading LXC 1004)
- Docker Compose: Next.js app (`web`) + `cloudflared` (token tunnel, `--protocol http2`)
- Public hostname `kara2.4voice.ai` → `http://web:3000`
- **No** Cloudflare Access (open party QR join)
- DB remains Supabase
- `MEDIA_SERVER_URL=https://media.4voice.ai` (existing `karaoke-media` tunnel)

## Dependencies / what could break

- Repo packaging: `next.config.js` standalone output, new `Dockerfile`, `docker-compose.yml`
- Cloudflare DNS for `4voice.ai` / Zero Trust tunnels
- Existing `media.4voice.ai` and trading tunnels must remain untouched
- Trading LXC 1004 must remain stopped/untouched

## Deployed facts

| Item | Value |
|------|-------|
| LXC | VMID **1005** `kara2` @ `10.0.19.235` on PVE B |
| App path | `/opt/kara2` |
| Tunnel | `kara2-web` (`d4f2b782-10f2-4264-9c4c-c150b929f54c`) |
| Public URL | https://kara2.4voice.ai |
| Media | https://media.4voice.ai |

## Test plan

- [x] LXC up; Docker healthy; LAN `http://10.0.19.235:3000` serves home
- [x] `cloudflared` registers http2 connections (dfw/iah)
- [x] External `https://kara2.4voice.ai` → Kara home (no Access redirect)
- [x] Search API returns songs; play URLs use `https://media.4voice.ai/...`
- [x] Sample media mp4 returns 200
- [x] Regression: `media.4voice.ai`, `futures.4voice.ai` unchanged; LXC 1004 still stopped

## Log

| Date | Event |
|------|-------|
| 2026-11-26 | Plan approved; implementation started |
| 2026-11-26 | LXC 1005 created; Docker installed; tunnel+DNS created; compose deployed |
| 2026-11-26 | Fixed cloudflared credentials mode 644; public HTTPS verified |
