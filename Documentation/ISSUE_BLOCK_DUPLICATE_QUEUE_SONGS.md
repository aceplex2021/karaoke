# Issue: Block duplicate songs in the active queue

**Date:** 2026-11-27  
**Status:** Implemented

## 1. Current Behavior
Users can add the same YouTube video / catalog version multiple times. Queue grows with duplicates.

## 2. Expected
Reject add if the same song is already **pending** or **playing** in that room. Clear error to user (“Already in queue”).

## 3. Root Cause
`POST /api/queue/add` and `POST /api/queue/add-youtube` insert with no uniqueness check. Client has no pre-check either.

## 4. Proposed Fix
**Server (source of truth):**
- **Catalog:** reject if pending/playing row exists with same `room_id` + `version_id`
- **YouTube:** reject if pending/playing row exists with same `room_id` + `metadata.videoId` (or `youtube_url` normalized via extracted id)
- Return **409** with `{ error: 'Already in queue' }`

**Client:** surface API error toast (already uses err.message). Optional: disable Add if local queue already has match.

**Scope:** same song by anyone in the room (not per-user). Completed/history songs may be re-added.

## 5. Risks
- Host intentionally wanting two copies of same song blocked (product choice: block)
- Metadata JSON query for YouTube videoId — use extract + scan pending/playing youtube rows
- Risk: low–medium

## 6. Test Plan
- [ ] Add YT video twice → second gets “Already in queue”
- [ ] Add catalog version twice → second rejected
- [ ] After song completes, can add again
- [ ] Two different videos still both add
- [ ] Host remove then re-add works
