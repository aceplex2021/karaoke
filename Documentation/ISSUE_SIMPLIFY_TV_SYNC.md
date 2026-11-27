# Issue: Simplify multi-TV sync

**Date:** 2026-11-27  
**Status:** Implemented  
**Approved:** User — "i like it, lets simplify it"

## Goal
Primary = sole clock via SSE playhead. Secondary = mute + follow. No wall-clock sync, no GET poll, no layered seek heuristics.

## Approach
1. Primary posts `{entryId, t, paused, wallMs}` on SSE only
2. Secondary applies playhead: seek if `|local-t| > ~1.5s`, match pause; ignore stale (>2s)
3. Remove: `fetchLastPlayhead` poll loop, wall bootstrap for secondary, forward-only/extrapolate maze
4. Secondary join: `startAtSeconds=0`, wait for first fresh playhead, then one seek
5. Keep: quiet TV register, primary ignore `tv_register` soft SSE (no hitch)

## Test
- [ ] Secondary join mid-song → catches primary within ~2s, no 1↔3 thrash
- [ ] Refresh secondary → primary unaffected; secondary re-follows
- [ ] Pause primary → secondary pauses
- [ ] Next song → both advance together
