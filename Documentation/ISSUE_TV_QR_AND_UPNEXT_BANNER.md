# Issue: TV QR position + Up Next flying banner

| Field | Value |
|-------|-------|
| **Issue ID** | `TV-QR-UPNEXT-001` |
| **Status** | DEPLOYED to kara2.4voice.ai 2026-11-26 |
| **Created** | 2026-11-26 |
| **Files** | `src/app/tv/page.tsx`, `src/app/globals.css` |

## Problems

1. QR / scan code is top-right; should be middle-right.
2. Green flying "UP NEXT" singer intro banner does not appear / animate.

## Root cause (banner)

Banner content uses `paddingLeft: 100%` and relies on `@keyframes scrollLeft` via `styled-jsx`. If keyframes never apply, the pill stays off-screen to the right (looks "broken"). Move keyframes to `globals.css` and use a stable class name.

Banner also requires `upNext`, playing `currentSong`, and `duration - currentTime <= 60` from player time updates.

## Fix

1. QR: `top: 50%; transform: translateY(-50%); right: 1rem`
2. Banner: global `@keyframes kara-scroll-left` + class; keep last-60s logic

## Test plan

- [ ] TV: QR sits vertically centered on the right
- [ ] With 2+ songs queued, last ~60s of current song: green UP NEXT marquee scrolls with next title + singer
- [ ] Room code still readable; no Access wall / regressions on LAN TV
