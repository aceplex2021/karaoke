# Issue: Host Google gate + full queue control

## Requirements
1. Host must Google sign-in before creating a room (`/create` already middleware-gated; reinforce create API + UI).
2. Host can reorder/remove any pending song (not only their own).

## Bug
`DELETE /api/queue/item/:id` only checked host when `room_id` query param was set; client never sent it → host got 403 on others’ songs.

## Fix
- Authorize host via `queueItem.room_id` → `kara_rooms.host_id` always.
- Pass `roomId` from client as well.
- Create page: redirect to `/login` if session missing.
