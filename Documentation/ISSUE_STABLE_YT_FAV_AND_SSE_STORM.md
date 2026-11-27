# Issue: Stable YouTube favorites + SSE refresh storms on TV

**Status:** Deployed on kara2

## 1. Stable YouTube favorites
**Problem:** Favorites store `kara_queue` UUIDs; orphans after rooms/queue churn.  
**Fix:** Store `youtube:VIDEO_ID` (+ `favorite_meta` for title/url). Normalize legacy queue UUIDs on GET/POST. History heart uses stable key.

## 2. SSE refresh storms
**Problem:** Many NOTIFY → many `refreshState` fetches + heavy `console.log` can freeze Smart TVs.  
**Fix:** Longer debounce on TV, in-flight coalesce (one refresh at a time + trailing), cut verbose TV logs. Same coalesce/debounce on room SSE.

## Test plan
- [ ] Star history YouTube song → prefs has `youtube:…`; survives without that queue row
- [ ] Heart stays filled after refresh; unstar works
- [ ] Samsung TV survives multi-song queue churn without “Page not responding”
- [ ] Secondary laptop still follows playhead
