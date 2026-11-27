# Issue: Cannot add history song to favorites (500)

**Status:** Deployed — pg-admin `.upsert()` live on kara2  
**Error:** `TypeError: ...from(...).upsert is not a function` on POST `/api/users/:id/favorites`

## Root cause
Local `pg-admin` client does not implement Supabase-compatible `.upsert()`. Favorites POST/DELETE call upsert on `kara_user_preferences`.

## Fix
Implement `.upsert(row, { onConflict })` in `pg-admin.ts` (INSERT ... ON CONFLICT DO UPDATE), including JSONB encoding for `favorite_song_ids`.
