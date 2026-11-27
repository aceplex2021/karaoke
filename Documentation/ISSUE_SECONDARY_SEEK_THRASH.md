# Issue: Secondary playhead seek thrash (1↔3 loop)

**Date:** 2026-11-27  
**Status:** Implementing

## Logs
- Bootstrap wall 601s (stale `current_song_started_at`) then hub playhead 101.6s (good)
- Seek to 101.6s then endless YouTube state 1↔3 (playing/buffering)

## Cause
`SYNC_DRIFT_SEC=0.12` + `SEEK_COOLDOWN=150ms` + `play()` every poll → seek storms.

## Fix
- Drift ≥ 1.5s, cooldown ≥ 2.5s; no seek while buffering
- Only pause/play on actual state mismatch
- Cap wall bootstrap; prefer hub playhead for `startAtSeconds`
- SW: stop intercepting navigations (failed `/room/*` fetches)
