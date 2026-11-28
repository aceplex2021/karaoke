# Issue: TV sync ≤100ms + reliable playhead delivery

**Date:** 2026-11-28  
**Status:** Implemented  
**Approved:** User — "go"

## Fixes
1. Persist last playhead in DB (`kara_rooms` JSON/columns) so GET works across workers
2. Lag/drift/cooldown for ~100ms target; remove intentional 0.35s trail
3. Visibility: only unsync after real hide (not every focus)
4. Song change: primary posts immediately; secondary accepts first packet for new entry
5. Diagnostic logs on secondary when poll null / entryId mismatch
