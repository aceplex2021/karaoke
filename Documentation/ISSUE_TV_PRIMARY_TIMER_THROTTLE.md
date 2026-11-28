# Issue: Samsung primary stops posting mid-song

**Date:** 2026-11-28  
**Status:** Fixed — server extrapolate + seed on advance; primary posts from YT timeupdate

## Evidence
- Playhead freezes at exact t (202.309…); ageMs grows; secondary seeks back then free-runs
- Refresh bootstraps stale packet; new song → poll null → Syncing black
- Primary still advances songs (YT events work) but setInterval posts stop

## Cause
Smart TV / streamer browsers throttle setInterval after idle; YouTube callbacks still fire.

## Fix
- Primary: post playhead from YouTube onTimeUpdate (throttled), not only setInterval
- Server GET: extrapolate fresh t from last packet when !paused
- Advance: seed playhead {entryId, t:0, wallMs:now} so secondary never waits on null
- Secondary: if t frozen across polls, stop seeking (free-run)
