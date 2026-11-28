# Issue: Secondary leads + stuck Syncing on refresh

**Date:** 2026-11-28  
**Status:** Fixed — trail behind primary; await DB persist; clear playhead on advance; pending playhead on player ready

## Problems
1. Secondary leads by a split second (extrapolation `t+age` aims ahead of main YouTube)
2. Refresh secondary → black “Syncing…” forever, even on new song (poll null / stale / entry race)

## Fix
- Target = `t - trail` (no +ageMs); only mild age use for stale detection
- Seek backward when ahead; forward when behind
- On poll null: keep waiting but on song change force unsync + retry; soften entryId while unsynced
- Ensure persist works; log DB errors; primary posts even at t=0
- If synced playhead goes stale mid-song, don't free-run forever — pause and show syncing again OR keep last good and continue with trail on next fresh
- New song: primary must post; secondary accept room entryId match; clear stale hub on advance
