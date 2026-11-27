# Issue: Phase A — Queue sort_key, UP NEXT banner, Multi-TV sync v1

**Date:** 2026-11-27  
**Scope:** Three related TV/queue correctness fixes before DB migration (Phase B).

---

## Issue A0: Queue up/down reorder flaky

### Current Behavior
Host/user taps move up/down → toast success → list often unchanged. Intermittent with mixed YouTube/local queues.

### Expected
Visible queue order changes immediately and matches playback order.

### Root Cause
Display/state orders by `sort_key`; reorder RPCs mutate `position`; adds often leave `position = 1`. Split-brain.

### Fix
- Single ordering field: `sort_key` for display, reorder adjacency, and `advance_playback` next-song selection.
- Add paths set real `sort_key` (and aligned `position` when needed).
- Reorder RPCs swap/update `sort_key` (midpoint or adjacent swap of sort_keys).
- App routes call updated RPCs; state continues `.order('sort_key')`.

### Risks
- Round-robin fairness if sort_key bands wrong — keep `calculate_round_robin_position` for adds.
- Live Supabase must get migration SQL applied (deploy docs + `db-migrate` or manual).

### Test Plan
- Add 3+ local songs (RR) → move up/down → order changes on device + TV.
- Mix YouTube FIFO + local → reorder still works.
- Advance plays next in displayed order.
- Regression: add, remove, skip, approval.

---

## Issue A1: UP NEXT flying banner intermittent

### Current Behavior
Green banner sometimes missing or looks stuck mid-scroll (esp. YouTube).

### Expected
Last ~90s of current song with a queued next: marquee scrolls reliably.

### Root Cause
Banner gated on YT `getCurrentTime`/`getDuration` which can be 0/stale; missing `upNext` also hides it. CSS/hysteresis alone insufficient.

### Fix
- Drive progress from YouTubePlayer interval with refs; fall back to known duration from queue metadata when player duration missing.
- Keep hysteresis + marquee remount key.
- Log gate failures when near end.

### Test Plan
- YouTube song, 2+ in queue, last 90s → banner scrolls.
- Local HTML5 path still works.
- No stuck mid-screen when song ends.

---

## Issue A2: Primary/secondary TVs not in sync

### Current Behavior
Screens show same song but drift; sometimes dual audio; secondary freezes mid-song; advance races.

### Expected (v1)
- Same song; secondary muted; primary-only advance.
- Secondary joining mid-song seeks to elapsed (or starts close), not full-song freeze when possible.
- Atomic primary registration.

### Root Cause
Queue-state sync only (no playhead). Any TV advances. Mute not reactive. `joinedMidSong` over-broad.

### Fix (v1 only — no continuous drift loop yet)
- `advance` only from primary TV (API enforces via `primary_tv_id` + `tv_id` header/body); advisory lock in SQL.
- Reactive mute on YouTubePlayer + HTML5 `muted={!isPrimaryTV}`.
- Atomic `UPDATE ... WHERE primary_tv_id IS NULL`.
- Use `current_song_started_at` for secondary seek-on-ready; remove blanket mid-song freeze when seek possible.

### Test Plan
- Two TVs: only primary has audio; switch primary → mute flips without remount.
- Both show same song; secondary join mid-song seeks near primary time.
- Song end: only one advance; no skip.
- Regression: single-TV still advances.

---

## Dependencies
- `kara_queue`, `kara_rooms`, RPCs, TV page, YouTubePlayer, queue add/reorder APIs, advance API.
- Deploy: SQL migrations must run on Supabase for A0/A2 RPCs.

## Approval
User: "proceed to phase A; commit/push to git when done"
