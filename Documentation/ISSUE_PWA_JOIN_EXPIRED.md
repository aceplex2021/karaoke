# Issue: Kara PWA join shows "Room expired" while mobile browser join works

## Current Behavior
- TVs OK
- Phone browser / QR join as user OK
- Same phone, installed Kara PWA → "Room expired or doesn't exist" (join 404)

## Root Cause
1. PWA keeps `localStorage` (`current_room_code`, `user_role=host`) across sessions; auto-rejoin / last-room can target a stale or mistyped code (e.g. `7XBC2Q` vs `7XBV2Q`).
2. UI mapped join **404** to "Room expired" (misleading).
3. Service worker intercepted all fetches including `/api/*` POSTs (`sw.js` respondWith fetch) — can fail or confuse PWA networking.
4. `getRoomByCode` / `joinRoom` lacked `cache: 'no-store'`.

## Fix
- SW: bypass `/api/` and non-GET; bump SW version
- API client: no-store on room code + join
- "Join Room (User)" clears stale room keys before `/join`
- Distinct 404 vs 410 error copy on room page
