# Checkpoint: Autoplay and Round-Robin Working

**Date:** 2026-01-15  
**Status:** ✅ Working  
**Purpose:** Stable checkpoint before fixing History/Search tabs

## What's Working

### ✅ Autoplay
- Videos automatically advance to next song when current song ends
- `handleEnded` callback properly triggers `advancePlayback`
- Uses both `addEventListener` and `onEnded` prop for reliability
- Double-firing guard prevents duplicate processing
- Immediate `refreshState` after advance ensures autoplay works

### ✅ Round-Robin
- Strict round-robin order enforced (A1, B1, A2, B2, A3, A4)
- `round_number` calculation finds first available round for user
- User reordering respects round-robin order
- Host reordering preserves round-robin fairness
- Queue sorting correctly uses `round_number ASC, position ASC`

### ✅ Reordering
- User queue reordering works correctly
- Host reordering works correctly
- TV queue reflects device queue changes
- Position and round_number updates are atomic

## Files Modified

### TV Page (`src/app/tv/page.tsx`)
- Added stable `handleEnded` callback with `useCallback`
- Dual event attachment (addEventListener + onEnded prop)
- Double-firing guard with `isAdvancingRef`
- Immediate `refreshState` after `advancePlayback`

### Database Functions
- `advance_playback` function: Atomic state transitions
- `user_reorder_queue` function: Round-robin aware reordering
- `host_reorder_queue` function: Round-robin aware reordering
- `calculate_round_robin_position` function: Correct round calculation

### API Routes
- `/api/rooms/[roomId]/advance`: TV playback advancement
- `/api/queue/reorder`: Host reordering endpoint
- `/api/rooms/[roomId]/state`: Queue sorting by round_number

## Rollback Instructions

If issues arise, revert to this checkpoint:

```bash
# Check current commit
git log --oneline -1

# If needed, revert specific files:
git checkout HEAD -- src/app/tv/page.tsx
git checkout HEAD -- database/create_advance_playback_function.sql
git checkout HEAD -- database/user_reorder_queue.sql
git checkout HEAD -- database/add_host_reorder_queue.sql
git checkout HEAD -- database/fix_round_robin_logic.sql
```

## Next Issue to Fix

- **History Tab**: Empty - should show last 12 months
- **Search Tab**: Empty - should show last 20 songs

**Root Cause:** `advance_playback` function doesn't write to `kara_song_history` table when songs complete.
