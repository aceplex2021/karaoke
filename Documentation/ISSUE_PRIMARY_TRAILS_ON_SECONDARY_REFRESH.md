# Issue: Primary display trails when secondary TV refreshes

**Date:** 2026-11-27  
**Status:** Implemented

## 1. Current Behavior
**Steps:**
1. Primary + secondary TV playing same song in sync
2. Refresh secondary display
3. Main/primary starts trailing (falls behind)

## 2. Expected
Refreshing secondary must not hitch primary playback. Secondary catches up via playhead only.

## 3. Root Cause
1. `register-tv` always `notifyRoom('tv_register')` → primary SSE `onRoom` → `refreshState`
2. Primary `refreshState` always `setRoom` / `setCurrentSong` / `setQueue` even when playback entry unchanged → React work + possible player hitch on constrained TVs
3. Secondary `loadRoom` seeks to wall-clock `current_song_started_at`, which is often ahead of primary’s real YouTube time → secondary leads, primary looks trailing
4. Primary also posts playhead during jank; secondary may briefly free-run at wall offset

## 4. Proposed Fix (isolated)
**Files:** `register-tv/route.ts`, `tv/page.tsx`, optionally `realtime-client` / stream event type

1. **Quiet TV register:** Skip `notifyRoom` when TV already in `connected_tv_ids` and primary unchanged (reconnect/refresh)
2. **Primary ignore soft TV events:** If SSE room event is `tv_register` / `tv_presence`, primary skips `refreshState` (or only updates TV list without touching `currentSong`)
3. **Secondary join:** Do **not** seek from wall `started_at` on secondary; wait for first playhead packet (primary is source of truth)
4. **Stable refresh:** If `current_entry_id` unchanged, keep existing `currentSong` object reference (skip `setCurrentSong`)

## 5. Risks
- Host UI TV list may lag until next real room event (low) — optional: phone host still refreshes on tv_register
- Secondary blank/0s until first playhead (~100–200ms) (acceptable)
- Risk: medium (TV playback path)

## 6. Test Plan
- [ ] Two TVs mid-song: refresh secondary → primary position continuous (no restart/seek jump)
- [ ] Secondary snaps to primary within ~0.3s after refresh
- [ ] First TV in empty room still becomes primary
- [ ] Advance / next song still syncs both
- [ ] Pause on primary still pauses secondary
