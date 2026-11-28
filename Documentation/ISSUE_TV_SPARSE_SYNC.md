# Issue: Sparse multi-TV sync (reduce constant chase)

**Date:** 2026-11-28  
**Status:** Fix3 — song-start lock &lt;100ms; remove ahead-eps thrash; free-run only corrects &gt;300ms  
**Checkpoint:** `checkpoint-known-good-sync-before-sparse-broadcast` @ `3ed02db`

## 1. Current Behavior
Continuous playhead chase: primary posts ~0.5–2s, secondary polls ~500ms, seeks on ~0.85s drift. Works but overdoes communication → seek thrash / Smart TV stress / mid-song hiccups.

## 2. Expected Behavior
- Song start: one lock seek; best-effort &lt;100ms, trail ≥50ms behind main
- Main broadcasts ~every 15s (SSE + light poll backup)
- Secondary seeks only if drift &gt;300ms, or if ahead of main
- Secondary never ahead of main; target = main − 50ms
- Mid-song: free-run between corrections

## 3. Root Cause
Follow rate was tuned for continuous lock, not sparse lock-and-free-run.

## 4. Dependencies & Risk
- `src/app/tv/page.tsx` — primary post cadence, follower apply/seek
- `src/app/api/realtime/playhead/route.ts` — memory freshness window vs 15s posts
- SSE stream / `realtime-client` — unchanged contract
- **Could break:** mid-song join Syncing exit; Samsung primary freeze if we rely only on setInterval (mitigate: keep onTimeUpdate + force on play/pause/song)
- **Rollback:** `git reset --hard checkpoint-known-good-sync-before-sparse-broadcast`

## 5. Proposed Fix
- Primary: burst ~1s for first 20s, then ~15s; force on song change + play/pause
- Secondary: lock-phase poll 1s until |error| ≤100ms (max 2 seeks + verify); then free-run
- Free-run seek / drift-pull only if ahead of main **or** behind trail by **&gt;300ms** (removed 20ms ahead-eps clamp that caused fwd/back thrash)
- Trail 50ms; mild age extrapolate on apply for seek target only
- Drift check every 10s; follower poll backup 15s

## 6. Test Plan
- [ ] Song start: console shows `Song-start lock OK` with |errMs| &lt;100; few Follow seeks
- [ ] Mid-song: Free-run OK; no constant “Drift &gt;300ms — requesting”
- [ ] HP trails; does not oscillate seek forward then back every ~3s
- [ ] Refresh HP mid-song: Syncing → lock (not yanked to 0)
- [ ] Primary Samsung: keeps playing; still broadcasts
- [ ] Rollback tag still points at prior good build
