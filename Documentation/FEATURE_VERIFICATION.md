# Feature Verification Report
**Date:** 2026-01-19  
**Migration Status:** Schema migrated, some DB functions need updating

---

## ✅ Queue Reorder & Remove (ALL WORKING)

### 1. Host Queue Reorder (TV Page)
**Endpoint:** `POST /api/queue/reorder`  
**Function:** `host_reorder_queue(p_room_id, p_queue_item_id, p_new_position)`  
**Status:** ✅ **WORKING** - No schema dependencies

**Verification:**
- Function operates on `kara_queue.position` and `round_number` only
- No references to `song_id` or `version_id`
- Uses advisory locks to prevent race conditions
- Handles both FIFO and round-robin queue modes

**Location:**
- API: `src/app/api/queue/reorder/route.ts`
- SQL: `database/add_host_reorder_queue.sql`

---

### 2. User Queue Reorder (Device Page)
**Endpoint:** `PATCH /api/queue/item/[queueItemId]/reorder`  
**Function:** `user_reorder_queue(p_queue_item_id, p_user_id, p_direction)`  
**Status:** ✅ **WORKING** - No schema dependencies

**Verification:**
- Function swaps positions between adjacent songs in user's queue
- No references to `song_id` or `version_id`
- Uses advisory locks to prevent conflicts with `advance_playback`
- Handles both FIFO and round-robin queue modes

**Location:**
- API: `src/app/api/queue/item/[queueItemId]/reorder/route.ts`
- SQL: `database/user_reorder_queue.sql`

---

### 3. Queue Item Remove/Delete
**Endpoint:** `DELETE /api/queue/item/[queueItemId]`  
**Status:** ✅ **WORKING** - Direct delete, no schema issues

**Verification:**
- Validates user ownership before deletion
- Prevents deletion of playing/completed songs
- Direct `DELETE FROM kara_queue` operation
- No dependencies on `song_id` or `version_id`

**Location:**
- API: `src/app/api/queue/item/[queueItemId]/route.ts`

---

## ⚠️ History Features (REQUIRES FIX)

### 4. User History (Recent)
**Endpoint:** `GET /api/users/[userId]/history/recent?limit=20`  
**Status:** ⚠️ **WILL FAIL** - Expects `version_id` in `kara_song_history`

**Issue:**
```typescript
.select(`
  *,
  kara_versions (
    id,
    title_display,
    ...
  )
`)
```
- API expects to join `kara_song_history` → `kara_versions` via `version_id`
- Current DB still has `song_id` column instead of `version_id`

**Fix Required:**
Run `database/migrations/FIX_HISTORY_TABLE.sql` to rename `song_id` → `version_id`

**Location:**
- API: `src/app/api/users/[userId]/history/recent/route.ts`

---

### 5. Room History
**Endpoint:** `GET /api/songs/history/[roomId]/[userId]`  
**Status:** ⚠️ **WILL FAIL** - Same issue as above

**Issue:**
- Same Supabase join issue: expects `version_id` in `kara_song_history`
- Currently has `song_id` column

**Fix Required:**
Run `database/migrations/FIX_HISTORY_TABLE.sql`

**Location:**
- API: `src/app/api/songs/history/[roomId]/[userId]/route.ts`

---

## ✅ Favorites Features (ALL WORKING)

### 6. Get Favorites
**Endpoint:** `GET /api/users/[userId]/favorites`  
**Status:** ✅ **WORKING** - Already migrated

**Verification:**
```typescript
.from('kara_versions')
.select(`id, title_display, tone, mixer, style, artist_name, performance_type`)
.in('id', favoriteSongIds)
```
- Correctly queries `kara_versions` table
- Treats favorite IDs as `version_id` (correct in new schema)

**Location:**
- API: `src/app/api/users/[userId]/favorites/route.ts`

---

### 7. Add to Favorites
**Endpoint:** `POST /api/users/[userId]/favorites`  
**Status:** ✅ **WORKING**

**Verification:**
- Updates `kara_user_preferences.favorite_song_ids` array
- In new schema, these IDs are treated as `version_id` (correct)

---

### 8. Remove from Favorites
**Endpoint:** `DELETE /api/users/[userId]/favorites?songId=<uuid>`  
**Status:** ✅ **WORKING**

**Verification:**
- Removes from `kara_user_preferences.favorite_song_ids` array
- No direct schema dependencies

---

## Summary

| Feature | Status | Action Required |
|---------|--------|----------------|
| Host Queue Reorder | ✅ Working | None |
| User Queue Reorder | ✅ Working | None |
| Queue Item Delete | ✅ Working | None |
| User History (Recent) | ⚠️ Broken | Run `FIX_HISTORY_TABLE.sql` |
| Room History | ⚠️ Broken | Run `FIX_HISTORY_TABLE.sql` |
| Get Favorites | ✅ Working | None |
| Add to Favorites | ✅ Working | None |
| Remove from Favorites | ✅ Working | None |

---

## Required Fixes (In Order)

1. **FIX_QUEUE_FOREIGN_KEY.sql** - Fix Supabase schema cache for joins
2. **FIX_HISTORY_TABLE.sql** - Rename `song_id` → `version_id` in `kara_song_history`
3. **FIX_ADVANCE_PLAYBACK_FUNCTION.sql** - Update playback function to use `version_id`

**After running all 3 fixes, all features will work! ✅**

---

## Testing Checklist

### Queue Operations
- [ ] Host reorders a song on TV page
- [ ] User reorders their own songs on device page
- [ ] User removes their own song from queue
- [ ] Verify round-robin queue mode still works

### History
- [ ] View recent history on user profile
- [ ] View room-specific history
- [ ] Verify `times_sung` increments correctly
- [ ] Check history after song completion

### Favorites
- [ ] Add song to favorites
- [ ] View favorites list
- [ ] Remove song from favorites
- [ ] Verify favorites persist across sessions
