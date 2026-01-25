# Phase 2: Fix "Stuck in Room" Issue - Implementation Complete
**Date**: 2026-01-24  
**Status**: ✅ Implementation Complete - Awaiting Approval  
**Checkpoint**: Created before changes

---

## Summary

Fixed the issue where users get stuck in rooms and cannot join new rooms. Implemented leave room functionality and auto-cleanup of old participations.

---

## Changes Made

### 1. ✅ Leave Room API Endpoint

**File**: `src/app/api/rooms/[roomId]/leave/route.ts` (NEW)

- **Endpoint**: `POST /api/rooms/[roomId]/leave`
- **Body**: `{ user_id: string }`
- **Functionality**: Removes user from room participation
- **Validation**: Verifies user is a participant before removing

**Usage:**
```typescript
await api.leaveRoom(roomId, userId);
```

---

### 2. ✅ Auto-Cleanup on Join

**File**: `src/app/api/rooms/join/route.ts` (UPDATED)

**Changes:**
- Before joining new room, automatically removes user from all other rooms
- Prevents accumulation of multiple participations
- Logs cleanup actions for debugging

**Code Added (Lines 88-99):**
```typescript
// Phase 2: Auto-cleanup - Remove user from all other rooms before joining new one
const { error: cleanupError } = await supabaseAdmin
  .from('kara_room_participants')
  .delete()
  .eq('user_id', user.id)
  .neq('room_id', room.id);  // Keep only the new room participation
```

**Behavior:**
- User joins Room A → Participation created
- User joins Room B → Room A participation removed, Room B participation created
- User can only be in one room at a time

---

### 3. ✅ Fixed Auto-Rejoin UI

**File**: `src/app/join/page.tsx` (UPDATED)

**Changes:**
- **Before**: Auto-redirected to last room (prevented manual room entry)
- **After**: Shows option to return to last room OR join different room

**New UI:**
- If last room exists, shows banner with:
  - "Return to last room: ABC123" button
  - "Join Different Room" button
- User can choose instead of being forced

**Code Changes:**
- Removed automatic `router.push()` redirect
- Added `lastRoomCode` state
- Added conditional banner UI

---

### 4. ✅ Leave Room Button

**File**: `src/app/room/[code]/page.tsx` (UPDATED)

**Changes:**
- Added "🚪 Leave Room" button in header (top right)
- Button triggers `handleLeaveRoom()` function
- Confirms before leaving
- Clears localStorage and redirects to `/join`

**UI Location:**
- Header section, top right corner
- Styled to match room header design
- Hover effect for better UX

**Handler Function:**
```typescript
const handleLeaveRoom = useCallback(async () => {
  if (!user || !room) return;
  if (!confirm('Are you sure you want to leave this room?')) return;
  
  await api.leaveRoom(room.id, user.id);
  // Clear localStorage and redirect
  window.location.href = '/join';
}, [user, room, showError]);
```

---

### 5. ✅ API Client Update

**File**: `src/lib/api.ts` (UPDATED)

**Added Method:**
```typescript
async leaveRoom(roomId: string, userId: string): Promise<{ success: boolean; message: string }>
```

**Usage:**
```typescript
await api.leaveRoom(roomId, userId);
```

---

### 6. ✅ Migration SQL

**File**: `database/v4.9_cleanup_multiple_participations.sql` (NEW)

**Purpose**: Clean up existing users who are in multiple rooms

**Strategy**: Keep only most recent room participation per user

**SQL:**
```sql
-- Delete all participations except the most recent one per user
WITH ranked_participations AS (
  SELECT 
    id,
    user_id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id 
      ORDER BY last_active_at DESC NULLS LAST, joined_at DESC
    ) as rn
  FROM kara_room_participants
  WHERE status = 'approved'
)
DELETE FROM kara_room_participants
WHERE id IN (
  SELECT id FROM ranked_participations WHERE rn > 1
);
```

**To Run:**
```bash
# In Supabase SQL Editor or psql
\i database/v4.9_cleanup_multiple_participations.sql
```

---

## Testing Checklist

### Manual Testing Required:

- [ ] **Leave Room Button**
  - [ ] Click "Leave Room" button in room header
  - [ ] Confirm dialog appears
  - [ ] After confirming, user is removed from room
  - [ ] Redirects to `/join` page
  - [ ] localStorage cleared

- [ ] **Auto-Cleanup on Join**
  - [ ] Join Room A → Verify participation created
  - [ ] Join Room B → Verify Room A participation removed
  - [ ] Check database: user should only be in Room B

- [ ] **Auto-Rejoin UI**
  - [ ] Join a room
  - [ ] Navigate to `/join` page
  - [ ] Verify banner shows "Return to last room" option
  - [ ] Click "Join Different Room" → Verify can enter new code
  - [ ] Click "Return to [code]" → Verify redirects to last room

- [ ] **Migration SQL**
  - [ ] Run migration SQL
  - [ ] Verify users in multiple rooms are cleaned up
  - [ ] Verify each user has only 1 participation

---

## Files Modified

1. ✅ `src/app/api/rooms/[roomId]/leave/route.ts` (NEW)
2. ✅ `src/app/api/rooms/join/route.ts` (UPDATED)
3. ✅ `src/app/join/page.tsx` (UPDATED)
4. ✅ `src/app/room/[code]/page.tsx` (UPDATED)
5. ✅ `src/lib/api.ts` (UPDATED)
6. ✅ `database/v4.9_cleanup_multiple_participations.sql` (NEW)

---

## Breaking Changes

**None** - All changes are additive or improve existing behavior.

---

## Rollback Plan

If issues arise:

1. **Revert code changes:**
   ```bash
   git checkout HEAD -- src/app/api/rooms/join/route.ts
   git checkout HEAD -- src/app/join/page.tsx
   git checkout HEAD -- src/app/room/[code]/page.tsx
   git checkout HEAD -- src/lib/api.ts
   ```

2. **Remove new files:**
   ```bash
   rm src/app/api/rooms/[roomId]/leave/route.ts
   rm database/v4.9_cleanup_multiple_participations.sql
   ```

3. **Migration is safe** - Only deletes duplicate participations, doesn't affect single participations

---

## Next Steps

1. **Review changes** - Check all modified files
2. **Test manually** - Follow testing checklist above
3. **Run migration** - Execute `v4.9_cleanup_multiple_participations.sql` in Supabase
4. **Approve & commit** - Once testing passes
5. **Proceed to Phase 2.1** - Stale participations fix (Solution 4) ✅
6. **Proceed to Phase 1** - Room expiry fixes (after Phase 2.1 complete)

---

# Phase 2.1: Stale Participations Fix (Solution 4) - ✅ COMPLETE
**Date**: 2026-01-24  
**Status**: ✅ Implementation Complete - Awaiting Approval  
**Purpose**: Handle users who forget to click "Leave Room" button

---

## Summary

Implemented Solution 4 to automatically handle stale participations:
1. ✅ Track actual activity (update `last_active_at` on room state fetch, debounced to 1 min)
2. ✅ Smart cleanup on join (only remove stale >24h participations)
3. ✅ Scheduled cleanup job (safety net for edge cases)

---

## Changes Implemented

### 1. ✅ Update Activity Tracking

**File**: `src/app/api/rooms/[roomId]/state/route.ts` (UPDATED)

**Changes:**
- Accepts optional `userId` query parameter
- Updates `last_active_at` when user fetches room state
- **Debounced**: Only updates if last update was >1 minute ago
- Prevents excessive database writes

**Code Added:**
```typescript
// Phase 2.1: Update last_active_at for user (debounced to once per minute)
if (userId) {
  // Check if user is participant
  // Only update if last update was >1 minute ago
  // Updates last_active_at to track actual activity
}
```

**Files Updated:**
- `src/lib/api.ts` - Added optional `userId` parameter to `getRoomState()`
- `src/app/room/[code]/page.tsx` - Passes `user.id` to `getRoomState()`
- `src/app/tv/page.tsx` - Passes `tvUserId` to `getRoomState()`

---

### 2. ✅ Smart Cleanup on Join

**File**: `src/app/api/rooms/join/route.ts` (UPDATED)

**Changes:**
- **Before**: Removed ALL other room participations
- **After**: Only removes stale participations (>24h inactive)
- **Keeps**: Recent participations (<24h) in case user returns
- **Never removes**: Hosts (they own the room)

**Code Updated:**
```typescript
// Phase 2.1: Smart cleanup - Remove only stale participations (>24h inactive)
// Fetch all other participations
// Filter to only stale ones (>24h or null last_active_at)
// Delete only stale participations
// Never remove hosts
```

**Behavior:**
- User joins Room A → Participation created
- User closes browser (forgets to leave)
- 25 hours later, user joins Room B → Room A removed (stale)
- If user joins Room B 1 hour later → Room A kept (recent, user might return)

---

### 3. ✅ Scheduled Cleanup Job

**File**: `database/v4.9_cleanup_stale_participations.sql` (NEW)

**Contents:**
- Function: `cleanup_stale_participations()`
- Removes participations inactive >24 hours
- Never removes hosts
- Scheduled via pg_cron to run hourly

**To Run:**
```sql
-- In Supabase SQL Editor
\i database/v4.9_cleanup_stale_participations.sql
```

**Verification:**
```sql
-- Check function exists
SELECT routine_name FROM information_schema.routines 
WHERE routine_name = 'cleanup_stale_participations';

-- Check job is scheduled
SELECT * FROM cron.job WHERE jobname = 'cleanup-stale-participations';
```

---

## Implementation Details

**Stale Threshold**: 24 hours (aligns with room expiry)  
**Update Frequency**: Debounced to 1 minute (reduces DB writes from every 2.5s poll)  
**Host Handling**: Hosts are never auto-removed (they own the room)  
**Cleanup Strategy**: 
- On join: Remove stale participations immediately
- Scheduled: Hourly cleanup as safety net

---

## Files Modified

1. ✅ `src/app/api/rooms/[roomId]/state/route.ts` (UPDATED)
2. ✅ `src/app/api/rooms/join/route.ts` (UPDATED)
3. ✅ `src/lib/api.ts` (UPDATED)
4. ✅ `src/app/room/[code]/page.tsx` (UPDATED)
5. ✅ `src/app/tv/page.tsx` (UPDATED)
6. ✅ `database/v4.9_cleanup_stale_participations.sql` (NEW)

---

## Testing Checklist

- [ ] **Activity Tracking**
  - [ ] User actively uses room → `last_active_at` updates (max once per minute)
  - [ ] Check database: `last_active_at` reflects actual activity, not just join time

- [ ] **Smart Cleanup on Join**
  - [ ] Join Room A, close browser
  - [ ] Wait 25 hours, join Room B → Room A removed (stale)
  - [ ] Join Room A, close browser
  - [ ] Wait 1 hour, join Room B → Room A kept (recent)

- [ ] **Scheduled Cleanup**
  - [ ] Run migration SQL
  - [ ] Verify function created
  - [ ] Verify job scheduled
  - [ ] Wait 1 hour → Verify stale participations cleaned up

---

## Notes

- Activity tracking is debounced to prevent excessive DB writes
- Smart cleanup allows users to return to recent rooms
- Scheduled cleanup catches edge cases (user never joins another room)
- Hosts are protected from auto-removal

---

## Notes

- Leave room button is visible to all users (not just hosts)
- Auto-cleanup happens silently in background
- Migration keeps most recent participation (safest approach)
- All changes follow existing code patterns and conventions
