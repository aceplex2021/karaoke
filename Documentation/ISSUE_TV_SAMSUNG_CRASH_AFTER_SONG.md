# Issue: Samsung TV (Google Streamer) crashes after ~1 song post Phase B

**Status:** Deployed to kara2 — awaiting Samsung 2-song verification  
**Room example:** `7XBV2Q` — `https://kara2.4voice.ai/tv?code=7xbv2q`  
**Observed:** "Page not responding" on Samsung + Google Streamer browser after first song ends / second starts.  
**Control:** HP laptop as secondary TV — no crash.

---

## 1. Current Behavior

1. Open TV URL on Samsung (Google Streamer browser) as primary.
2. Play one YouTube karaoke track to completion (or advance).
3. Page freezes with browser "Page not responding"; Close required.

Laptop secondary in same room stays healthy.

## 2. Expected Behavior

Primary Samsung TV advances to next song and keeps playing indefinitely without hanging.

## 3. Root Cause Analysis

Phase B replaced Supabase playhead broadcast with **HTTP POST `/api/realtime/playhead` every 100ms** from the primary, plus SSE fanout. Samsung primary therefore:

- Issues ~10 `fetch` calls/sec for the whole song (thousands per track).
- Keeps EventSource open and parses playhead events (even though primary ignores them).
- On song change, `<YouTubePlayer key={currentSong.id}>` **fully remounts** while `YouTubePlayer` **never calls `player.destroy()`** on unmount → orphaned iframes / timers.

Laptop secondary only *receives* SSE (no playhead POST storm) → survives. Cumulative load + unclean YT teardown explains crash right at song 1→2, only on constrained TV browser, only since migration.

**Files:**
- `src/app/tv/page.tsx` — `SYNC_INTERVAL_MS = 100`, `key={currentSong.id}`, SSE refresh
- `src/lib/realtime-client.ts` — unbounded `postPlayhead` fetches
- `src/components/YouTubePlayer.tsx` — no `destroy()` cleanup; remount vs `loadVideoById`

## 4. Dependencies & Risk

| Area | Risk | Notes |
|------|------|--------|
| Multi-TV follower sync | Medium | Wider playhead interval → slightly higher drift; raise drift threshold |
| YouTube playback | Medium | Reuse player via `loadVideoById` instead of remount |
| Room SSE refresh | Low | Debounce only |
| Non-TV clients | Low | Unaffected |

## 5. Proposed Fix

1. **YouTubePlayer:** `destroy()` + clear interval on unmount; reset error and `loadVideoById` on `videoId` change (no forced remount).
2. **TV page:** Drop `key={currentSong.id}`; debounce SSE `refreshState`; lighter playhead cadence on constrained TV UA (~750ms) vs desktop (~400ms); coalesce in-flight playhead POSTs.
3. **realtime-client:** Skip overlapping playhead POSTs (drop if prior still in flight).
4. **utils:** `isConstrainedTvBrowser()` for Tizen / CrKey / SmartTV / etc.

## 6. Test Plan

- [ ] Samsung primary: play ≥2 songs back-to-back without "Page not responding"
- [ ] HP laptop secondary: still follows within ~0.5–1s
- [ ] Single-TV room (Samsung only): advance / Play Next still works
- [ ] Desktop Chrome TV page: no regression
- [ ] Regression: join room, queue add, host controls

## 7. Approval

User requested immediate fix ("Need to fix it"). Proceeding with checkpoint + isolated change.
