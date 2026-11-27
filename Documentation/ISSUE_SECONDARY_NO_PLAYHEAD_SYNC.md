# Issue: Secondary starts at 0 / never follows primary

**Date:** 2026-11-27  
**Status:** Implemented

## Current
Secondary logs “waiting for primary playhead”, YouTube goes PLAYING from 0, never catches main.

## Cause
1. Wall-clock bootstrap removed → refresh always starts at 0 if playhead missing/late.
2. Playhead-only path is fragile (SSE drops / player not ready drops packets / `if (!local) return`).

## Fix
1. Restore wall-clock **bootstrap** seek on secondary join/refresh.
2. Keep last playhead in hub; secondary **polls** GET as backup to SSE.
3. Queue/re-apply playhead when player ready; never drop solely because local read is null.
4. If no playhead for ~1.5s, re-bootstrap from wall elapsed.
