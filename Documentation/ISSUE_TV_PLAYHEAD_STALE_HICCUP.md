# Issue: Sync hiccup → permanent Syncing; primary risk

**Date:** 2026-11-28  
**Status:** Fixed — async throttled persist, no stale→unsync, softer seeks, fetch timeout

## Evidence
- Sync works then freezes: playhead stuck at t≈80.23, ageMs grows 4s→178s
- Secondary unsynced on stale → black forever
- Refresh mid-song: poll null (primary not posting)
- Seek thrash early (ahead 0.16–0.42) buffers YouTube on secondary

## Root cause
1. Await DB persist every POST + no fetch timeout → primary post queue can stall; wallMs freezes
2. Stale→markFollowerUnsynced blacks secondary even when song was synced
3. Aggressive seek-back on trail amplifies buffering

## Fix
- Primary: fire-and-forget persist, throttle DB ~1s; fetch timeout so inFlight cannot stick
- Secondary: never unsync/black on stale mid-song — free-run; Syncing only before first sync / song change
- Softer seek: wider drift, less frequent seeks; slower primary tick for Smart TV
