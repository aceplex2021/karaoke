# Checkpoint: History and Search Tabs Working

**Date:** 2026-01-15  
**Status:** ✅ Working  
**Previous Checkpoint:** CHECKPOINT_AUTOPLAY_ROUNDROBIN_WORKING.md

## What's Working

### ✅ History Tab
- Shows last 12 months of songs sung by user in the room
- Displays song title, artist (if available), date, and times_sung
- "Unknown" text removed - only shows artist if it exists
- Click to add songs from history back to queue
- Properly filters by room_id and date range

### ✅ Search Tab - Recent Songs Section
- Shows last 20 recent songs (across all rooms)
- Displays song title, artist (if available), and date
- "Unknown" text removed - only shows artist if it exists
- Click to add songs from recent history back to queue
- Always visible (even when empty) with helpful message

### ✅ History Writing
- `advance_playback` function writes to `kara_song_history` when songs complete
- Handles both `song_id` (backward compatibility) and `version_id` → `song_id` paths
- UPSERT logic: increments `times_sung` if entry exists, otherwise creates new entry
- Updates `sung_at` timestamp correctly

## Files Modified

### Database Functions
- `database/create_advance_playback_function.sql`: Added history writing logic

### API Endpoints
- `src/app/api/users/[userId]/history/route.ts`: History endpoint (last 12 months, room-filtered)
- `src/app/api/users/[userId]/history/recent/route.ts`: Recent songs endpoint (last 20, all rooms)
  - Handles join failures by fetching songs separately
  - Robust error handling for missing song data

### Frontend
- `src/app/room/[code]/page.tsx`:
  - History tab: Removed "Unknown" text, improved formatting
  - Search tab: Recent Songs section always visible, removed "Unknown" text
  - Added console logging for debugging

### API Client
- `src/lib/api.ts`: Added logging for recent songs API calls

## Key Technical Details

### History Writing Flow
1. Song finishes playing (video `ended` event)
2. TV page calls `api.advancePlayback(roomId)`
3. API calls PostgreSQL function `advance_playback(room_id)`
4. Function:
   - Marks current song as `completed`
   - Gets `song_id` from queue item or version
   - Writes/updates `kara_song_history` entry
   - Advances to next song

### Recent Songs Query Fix
- **Issue**: Supabase join `kara_songs(*)` was filtering out all entries (returning 0)
- **Solution**: When join fails, fetch songs separately by `song_id` and map them
- **Fallback**: Returns raw history with null songs if fetch fails

### History Query
- Filters by `sung_at >= twelveMonthsAgo` (12 months)
- Optional `room_id` filter
- Join with `kara_songs` works correctly (different from recent endpoint)

## Database Schema

### kara_song_history Table
```sql
CREATE TABLE kara_song_history (
    id UUID PRIMARY KEY,
    room_id UUID NOT NULL,
    user_id UUID NOT NULL,
    song_id UUID NOT NULL,
    sung_at TIMESTAMPTZ DEFAULT NOW(),
    times_sung INTEGER DEFAULT 1
);
```

## Rollback Instructions

If issues arise, revert to this checkpoint:

```bash
# Check current commit
git log --oneline -1

# Revert specific files if needed:
git checkout HEAD -- database/create_advance_playback_function.sql
git checkout HEAD -- src/app/api/users/[userId]/history/recent/route.ts
git checkout HEAD -- src/app/api/users/[userId]/history/route.ts
git checkout HEAD -- src/app/room/[code]/page.tsx
git checkout HEAD -- src/lib/api.ts
```

## Testing Checklist

### History Tab
- [x] Shows songs from last 12 months
- [x] Filters by room correctly
- [x] Displays song title, artist (if available), date
- [x] No "Unknown" text when artist missing
- [x] Click to add works
- [x] Times_sung counter works

### Search Tab - Recent Songs
- [x] Shows last 20 songs (across all rooms)
- [x] Displays song title, artist (if available), date
- [x] No "Unknown" text when artist missing
- [x] Click to add works
- [x] Shows helpful message when empty

### History Writing
- [x] Songs write to history when completed
- [x] History entries have correct song_id
- [x] History entries have correct user_id and room_id
- [x] Times_sung increments for duplicate songs
- [x] sung_at timestamp is correct

## Known Issues / Notes

- **Join Query Behavior**: The Supabase join `kara_songs(*)` in the recent endpoint filters out entries when songs don't exist. This is handled by fetching songs separately.
- **History Tab Join Works**: The history endpoint's join works correctly, possibly due to different query structure or data.
- **Backfill Available**: `database/backfill_history_from_completed_songs.sql` can backfill history for songs that completed before the fix.

## Next Steps

All history and search functionality is working. Ready for next issue.
