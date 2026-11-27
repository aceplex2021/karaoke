# Issue: Secondary TV must follow primary within ~100ms

**Date:** 2026-11-27  
**Status:** Implemented (playhead broadcast + follower seek, 100ms drift threshold)

## Current Behavior
Secondary shows same song and seeks once on join/song change, but drifts during playback. User wants secondary as view-only follower, in sync within 100ms.

## Expected
- Secondary: no advance, no playback authority — display only
- Continuously match primary playhead within ~100ms
- Mute always on secondary

## Approach
- Primary broadcasts `{ t, state, entryId, at }` on Supabase Realtime **broadcast** channel `tv-sync-{roomId}` every ~100ms while playing
- Secondary subscribes; if `|local - primary| > 100ms` (or state mismatch), `seekTo` / play/pause to match
- Secondary never calls `/advance`

## Risks
- YouTube iframe seek jitter may occasionally exceed 100ms; we still target 100ms correction threshold
- Broadcast rate ~10/s per primary — acceptable for LAN/Realtime

## Test Plan
- Two TVs, same room: scrub/pause not required; during play, secondary tracks primary
- Kill primary mid-song: secondary stays (no advance); host/other primary can take over later
- Banner/reorder regression smoke
