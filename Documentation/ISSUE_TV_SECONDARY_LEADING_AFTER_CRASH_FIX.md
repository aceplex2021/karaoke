# Issue: Secondary TV leads / poor sync after Samsung crash fix

**Status:** Deployed to kara2 — awaiting dual-TV sync verification  
**Related:** `ISSUE_TV_SAMSUNG_CRASH_AFTER_SONG.md`

## Current Behavior
Samsung primary no longer crashes, but HP laptop secondary leads primary and sync is worse than pre-fix.

## Root Cause
Crash mitigation over-corrected sync:
1. Playhead gated on `connected_tv_ids.length > 1` — if JSONB is not a JS array (or only primary registered), **primary posts nothing** → secondary free-runs and often leads.
2. Interval 400–750ms + drift 0.25–0.45s too loose vs prior ~100ms / 0.1s.
3. Follower applied `payload.t + ageSec` (up to +250ms) → systematically seeks **ahead** of primary (“leading”).

## Fix (keep crash mitigations)
- Always post playhead from primary (rely on coalesce + ~200ms cadence, not connected_tv gate).
- Restore tighter drift (~0.12s) and seek cooldown (~150ms).
- Seek to primary `t` only — no age lead; correct when ahead or behind.
- Keep: YT player reuse/destroy, UI throttle, SSE debounce, in-flight coalesce.

## Test Plan
- [ ] Samsung primary + HP secondary: secondary follows (does not lead), sync ≈ pre-migration
- [ ] Samsung still survives 2+ song advances without “Page not responding”
