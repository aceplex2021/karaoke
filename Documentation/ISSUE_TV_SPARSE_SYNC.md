# Issue: Sparse multi-TV sync (reduce constant chase)

**Date:** 2026-11-28  
**Status:** Implemented — awaiting device test  
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
- Primary: `PRIMARY_POST_MIN_MS` / interval ≈ 15s; force on song change + play/pause
- Secondary poll backup ≈ 15s; on-demand fetch if local drift estimate &gt;300ms
- Trail 50ms; seek if ahead of main OR |error vs target| &gt;300ms; always seek on first lock
- Raise GET `MEMORY_FRESH_MS` so 15s packets stay in memory without DB hammer

## 6. Test Plan
- [ ] Song start: HP leaves Syncing, locks near primary, trails (~50ms+)
- [ ] Mid-song 2–3 min: no seek thrash; occasional correct if drift &gt;300ms
- [ ] HP never leads primary
- [ ] Refresh HP mid-song: Syncing → lock to live main (not yanked to 0 wrongly)
- [ ] Primary Samsung: keeps playing; still broadcasts
- [ ] Rollback tag still points at prior good build
