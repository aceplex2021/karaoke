# Fix: History and Search Tabs Empty

**Date:** 2026-01-15  
**Status:** ✅ Fixed  
**Checkpoint:** CHECKPOINT_AUTOPLAY_ROUNDROBIN_WORKING.md

## Problem

- **History Tab**: Empty - should show last 12 months of songs sung by user in the room
- **Search Tab**: Empty - should show last 20 recent songs (across all rooms)

## Root Cause

The `advance_playback` PostgreSQL function was marking songs as `completed` but **not writing to `kara_song_history` table**. This meant:
- No history entries were created when songs finished
- Recent songs API returned empty results
- History API returned empty results

## Solution

### 1. Updated `advance_playback` Function

**File:** `database/create_advance_playback_function.sql`

**Changes:**
- Added logic to write to `kara_song_history` when a song completes
- Gets `song_id` from queue item (backward compatibility) or from `version_id` → `kara_versions` → `song_id`
- Uses UPSERT logic: if history entry exists, increments `times_sung`; otherwise creates new entry
- Updates `sung_at` timestamp to current time

**Key Logic:**
```sql
-- Get song_id (prefer from queue, fallback to version)
IF v_current_song_id_from_queue IS NOT NULL THEN
  v_current_song_id := v_current_song_id_from_queue;
ELSIF v_current_version_id IS NOT NULL THEN
  SELECT song_id INTO v_current_song_id
  FROM kara_versions
  WHERE id = v_current_version_id;
END IF;

-- Write to history (UPSERT)
IF v_existing_history_id IS NOT NULL THEN
  UPDATE kara_song_history
  SET times_sung = times_sung + 1, sung_at = NOW()
  WHERE id = v_existing_history_id;
ELSE
  INSERT INTO kara_song_history (room_id, user_id, song_id, sung_at, times_sung)
  VALUES (p_room_id, v_current_user_id, v_current_song_id, NOW(), 1);
END IF;
```

### 2. Improved Search Tab UI

**File:** `src/app/room/[code]/page.tsx`

**Changes:**
- Recent Songs section now **always displays** (even when empty)
- Shows helpful message when no recent songs: "No recent songs yet. Songs you've sung will appear here!"
- Better user experience - users know the feature exists even when empty

## How It Works

### History Tab Flow
1. User clicks "History" tab
2. Calls `api.getUserHistory(user.id, room.id)`
3. API endpoint: `/api/users/${userId}/history?room_id=${roomId}`
4. Returns songs from `kara_song_history` filtered by:
   - Last 12 months (`sung_at >= twelveMonthsAgo`)
   - Optional room filter
   - Ordered by `sung_at DESC`

### Search Tab Recent Songs Flow
1. User opens Search tab
2. `useEffect` calls `api.getUserRecentSongs(user.id, 20)` when user is available
3. API endpoint: `/api/users/${userId}/history/recent?limit=20`
4. Returns last 20 songs from `kara_song_history` (across all rooms)
5. Ordered by `sung_at DESC`

### History Writing Flow
1. Song finishes playing (video `ended` event fires)
2. TV page calls `api.advancePlayback(roomId)`
3. API calls PostgreSQL function `advance_playback(room_id)`
4. Function:
   - Marks current song as `completed`
   - Gets `song_id` from queue item or version
   - Writes/updates `kara_song_history` entry
   - Advances to next song

## Testing

After applying the fix:

1. **Play some songs** - let them finish naturally (autoplay)
2. **Check History Tab** - should show songs from last 12 months
3. **Check Search Tab** - should show "Recent Songs (Last 20)" section with songs
4. **Verify `kara_song_history` table** - should have entries with `sung_at` timestamps

## Database Migration

Run the updated function:

```sql
-- Apply the updated advance_playback function
\i database/create_advance_playback_function.sql
```

## Rollback

If issues arise:

```bash
# Revert to previous version of advance_playback function
git checkout HEAD -- database/create_advance_playback_function.sql

# Then re-run the SQL file to restore previous version
```

## Notes

- History entries are created **only when songs complete** (not when added to queue)
- `times_sung` counter tracks how many times a user sang a song in a room
- History is room-specific (can filter by room_id)
- Recent songs are global (across all rooms)
