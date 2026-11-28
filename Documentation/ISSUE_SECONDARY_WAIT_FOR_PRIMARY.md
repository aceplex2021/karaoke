# Issue: Secondary must wait for primary (no free-run)

**Date:** 2026-11-28  
**Status:** Implemented

## Reports
1. Secondary slightly **ahead** of main (want trail / match, not lead)
2. Refresh secondary → plays from 0; prefer **black/paused** until matched
3. Leave and return → resumes local position instead of following main

## Logs
Secondary waits for SSE playhead, YouTube goes PLAYING from 0, **no `Follow seek` logs** — playhead never applied; free-run.

## Fix (keep simple model)
- Primary remains sole clock
- Secondary: **paused until first fresh playhead**, then seek + play
- Apply `target = t - lag` (~0.35s) so secondary trails
- Delivery: SSE + light GET poll (SSE playhead alone not arriving in prod)
- On tab visible again: reset catch-up, pause until next playhead
