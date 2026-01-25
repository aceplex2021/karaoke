# Room Expiry Investigation Report
**Date**: 2026-01-24  
**Issue**: Rooms don't expire after 24 hours  
**Status**: ✅ Phase 1 Implementation Complete - Awaiting Approval

---

## Implementation Status (Phase 1)

✅ **All fixes implemented** - Ready for testing and approval

### Completed Changes:

1. ✅ **Migration SQL Created** - `database/v5.0_fix_room_expiry.sql`
   - Backfills existing rooms with proper `expires_at` values
   - Sets default value for `expires_at` column
   - Sets up pg_cron scheduled job to expire rooms hourly

2. ✅ **Room Creation Updated** - `src/app/api/rooms/create/route.ts`
   - Explicitly sets `expires_at = created_at + 24 hours` when creating rooms

3. ✅ **Expiry Checks Added** - All room access endpoints
   - `src/app/api/rooms/join/route.ts` - Checks expiry before allowing join
   - `src/app/api/rooms/[roomId]/state/route.ts` - Checks expiry before returning state
   - `src/app/api/rooms/code/[code]/route.ts` - Checks expiry before returning room

4. ✅ **Scheduled Job Setup** - pg_cron job configured
   - Runs hourly to call `expire_old_rooms()` function
   - Automatically expires rooms where `expires_at < NOW()`

### Next Steps:

1. **Review changes** - Check all modified files
2. **Run migration** - Execute `database/v5.0_fix_room_expiry.sql` in Supabase
3. **Test manually** - Follow testing checklist below
4. **Approve & commit** - Once testing passes

---

---

## Summary

Rooms are **NOT expiring** after 24 hours due to **4 critical issues**:

1. ❌ **No default value** for `expires_at` column in database
2. ❌ **Room creation doesn't set `expires_at`** in application code
3. ❌ **No scheduled job** to call `expire_old_rooms()` function
4. ❌ **No expiry check** when accessing rooms (join/state endpoints)

---

## Root Cause Analysis

### Issue 1: Missing Default Value in Database Schema

**Current State:**
```sql
-- Database query result:
column_name | column_default | is_nullable 
-------------+----------------+-------------
expires_at  |                | YES
```

**Problem:**
- `expires_at` column exists but has **NO default value**
- Migration script (`v4.0_youtube_approval.sql`) attempted to set default:
  ```sql
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ 
    DEFAULT (NOW() + INTERVAL '24 hours');
  ```
- But this default was **never applied** to existing database

**Evidence:**
- All recent rooms have `expires_at = NULL`:
  ```
  room_code | created_at           | expires_at | is_active 
  ----------+----------------------+------------+-----------
  LLQVTC    | 2026-01-25 00:53:43  |            | t
  6DBBYP    | 2026-01-25 00:47:05  |            | t
  RWMQXH    | 2026-01-25 00:32:03  |            | t
  ```

---

### Issue 2: Room Creation Doesn't Set `expires_at`

**File**: `src/app/api/rooms/create/route.ts`

**Current Code (Line 98-108):**
```typescript
const { data: room, error: roomError } = await supabaseAdmin
  .from('kara_rooms')
  .insert({
    room_code: roomCode,
    room_name,
    host_id: user.id,
    queue_mode: selectedMode,
    approval_mode: selectedApprovalMode,
    // ❌ MISSING: expires_at is not set!
  })
  .select()
  .single();
```

**Problem:**
- Application code doesn't explicitly set `expires_at` when creating rooms
- Relies on database default (which doesn't exist)
- Result: All new rooms have `expires_at = NULL`

---

### Issue 3: No Scheduled Job to Call `expire_old_rooms()`

**Function Exists:**
```sql
CREATE OR REPLACE FUNCTION expire_old_rooms()
RETURNS void AS $$
BEGIN
  UPDATE kara_rooms
  SET is_active = false
  WHERE expires_at < NOW()
  AND is_active = true;
END;
$$ LANGUAGE plpgsql;
```

**Problem:**
- Function exists in database ✅
- Function is never called ❌
- No cron job, scheduled task, or background worker
- No Supabase Edge Function or pg_cron setup

**What's Missing:**
- Scheduled job (cron/pg_cron) to call `expire_old_rooms()` periodically
- Or: Background worker in Next.js to check and expire rooms
- Or: Supabase Edge Function with scheduled trigger

---

### Issue 4: No Expiry Check on Room Access

**File**: `src/app/api/rooms/join/route.ts` (Line 24-29)

**Current Code:**
```typescript
const { data: room, error: roomError } = await supabaseAdmin
  .from('kara_rooms')
  .select('*')
  .eq('room_code', room_code.toUpperCase())
  .eq('is_active', true)  // ✅ Checks is_active
  .single();
  // ❌ MISSING: Doesn't check if expires_at < NOW()
```

**Problem:**
- Only checks `is_active = true`
- Doesn't validate `expires_at < NOW()`
- Expired rooms (if `expires_at` was set) would still be accessible

**Same Issue in:**
- `src/app/api/rooms/[roomId]/state/route.ts` - No expiry check
- `src/app/api/rooms/code/[code]/route.ts` - No expiry check

---

## Impact Assessment

### Current Behavior
1. ✅ Rooms are created successfully
2. ❌ Rooms never expire (no `expires_at` set)
3. ❌ Old rooms accumulate in database
4. ❌ No cleanup mechanism

### Expected Behavior
1. ✅ Rooms created with `expires_at = created_at + 24 hours`
2. ✅ After 24 hours, `is_active = false` automatically
3. ✅ Expired rooms cannot be joined
4. ✅ Database stays clean

---

## Fixes Required (✅ All Implemented)

### ✅ Fix 1: Set Default Value in Database
**Status**: Implemented in `database/v5.0_fix_room_expiry.sql`

```sql
ALTER TABLE kara_rooms
  ALTER COLUMN expires_at 
  SET DEFAULT (NOW() + INTERVAL '24 hours');
```

### ✅ Fix 2: Update Room Creation Code
**Status**: Implemented in `src/app/api/rooms/create/route.ts`

```typescript
// Phase 1: Set expires_at explicitly (24 hours from now)
const expiresAt = new Date();
expiresAt.setHours(expiresAt.getHours() + 24);

const { data: room } = await supabaseAdmin
  .from('kara_rooms')
  .insert({
    room_code: roomCode,
    room_name,
    host_id: user.id,
    queue_mode: selectedMode,
    approval_mode: selectedApprovalMode,
    expires_at: expiresAt.toISOString(), // ✅ Explicitly set
  })
```

### ✅ Fix 3: Add Expiry Check to Room Access
**Status**: Implemented in all room access endpoints

**Files Updated:**
- `src/app/api/rooms/join/route.ts`
- `src/app/api/rooms/[roomId]/state/route.ts`
- `src/app/api/rooms/code/[code]/route.ts`

**Implementation:**
```typescript
// Phase 1: Check if room has expired
if (room.expires_at && new Date(room.expires_at) < new Date()) {
  // Room has expired, mark as inactive
  await supabaseAdmin
    .from('kara_rooms')
    .update({ is_active: false })
    .eq('id', room.id);
  
  return NextResponse.json(
    { error: 'Room has expired' },
    { status: 410 } // 410 Gone
  );
}
```

### ✅ Fix 4: Set Up Scheduled Job (Option A: Supabase pg_cron - SELECTED)
**Status**: Implemented in `database/v5.0_fix_room_expiry.sql`

**Implementation:**
```sql
-- Enable pg_cron extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule job to run every hour at minute 0
SELECT cron.schedule(
  'expire-old-rooms',
  '0 * * * *',  -- Cron format: minute hour day month weekday
  $$SELECT expire_old_rooms();$$
);

-- Verify job was created
SELECT * FROM cron.job WHERE jobname = 'expire-old-rooms';

-- To manually test the job (optional)
SELECT expire_old_rooms();
```

**Note**: Supabase may require enabling pg_cron in project settings. If extension creation fails, use Option B or C instead.

---

## Migration Plan (✅ Implementation Complete)

### Step 0: Analyze Current Room State (Before Migration)

**Run this query first to understand the scope:**
```sql
-- Analyze existing rooms by age and status
SELECT 
  CASE 
    WHEN created_at < NOW() - INTERVAL '24 hours' THEN 'Old (>24h ago)'
    WHEN created_at >= NOW() - INTERVAL '24 hours' THEN 'Recent (<24h ago)'
  END as age_category,
  is_active,
  COUNT(*) as total_rooms,
  COUNT(*) FILTER (WHERE expires_at IS NULL) as missing_expires_at,
  MIN(created_at) as oldest_room,
  MAX(created_at) as newest_room
FROM kara_rooms
GROUP BY age_category, is_active
ORDER BY age_category, is_active;

-- Check specific examples
SELECT 
  room_code,
  created_at,
  expires_at,
  is_active,
  NOW() - created_at as age,
  CASE 
    WHEN expires_at IS NULL THEN 'Missing expiry'
    WHEN expires_at < NOW() THEN 'Already expired'
    ELSE 'Valid'
  END as expiry_status
FROM kara_rooms
ORDER BY created_at DESC
LIMIT 10;
```

### Step 1: Backfill Existing Rooms (Comprehensive Fix)

**Problem with simple backfill:**
- Setting `expires_at = created_at + 24 hours` for old rooms would make them immediately expired
- Need to handle rooms of different ages appropriately

**Solution: Handle 3 categories of existing rooms**

```sql
-- Category 1: Rooms created > 24 hours ago → Expire immediately
UPDATE kara_rooms
SET expires_at = NOW(),
    is_active = false
WHERE expires_at IS NULL
AND is_active = true
AND created_at < NOW() - INTERVAL '24 hours';

-- Category 2: Rooms created < 24 hours ago → Set proper expiry
UPDATE kara_rooms
SET expires_at = created_at + INTERVAL '24 hours'
WHERE expires_at IS NULL
AND is_active = true
AND created_at >= NOW() - INTERVAL '24 hours';

-- Category 3: Rooms already inactive but missing expires_at → Set for consistency
UPDATE kara_rooms
SET expires_at = created_at + INTERVAL '24 hours'
WHERE expires_at IS NULL
AND is_active = false;

-- Verify backfill results
SELECT 
  CASE 
    WHEN created_at < NOW() - INTERVAL '24 hours' THEN 'Old (>24h)'
    WHEN created_at >= NOW() - INTERVAL '24 hours' THEN 'Recent (<24h)'
  END as age_category,
  is_active,
  COUNT(*) as count,
  COUNT(*) FILTER (WHERE expires_at IS NULL) as missing_expires_at
FROM kara_rooms
GROUP BY age_category, is_active
ORDER BY age_category, is_active;
```

**Alternative: Grace Period Approach**
If you want to give old rooms a grace period instead of expiring immediately:

```sql
-- Give all existing rooms 24 hours from now (grace period)
UPDATE kara_rooms
SET expires_at = NOW() + INTERVAL '24 hours'
WHERE expires_at IS NULL
AND is_active = true;

-- Then expire rooms that are already past their original 24-hour window
UPDATE kara_rooms
SET is_active = false
WHERE expires_at < NOW()
AND is_active = true;
```

**Which approach to use?**

- **Immediate Expiry (Category-based)**: Use if you want to clean up old rooms right away. Old rooms (>24h) expire immediately, recent rooms get proper expiry.
- **Grace Period**: Use if you want to give all existing rooms a fresh 24-hour window. More user-friendly but keeps old rooms active longer.

**Recommendation**: Use **Immediate Expiry** for production cleanup, or **Grace Period** if you want to avoid disrupting current users.

### Step 2: Add Default Value ✅
**Status**: Implemented in `database/v5.0_fix_room_expiry.sql`

```sql
ALTER TABLE kara_rooms
  ALTER COLUMN expires_at 
  SET DEFAULT (NOW() + INTERVAL '24 hours');
```

### Step 3: Update Application Code ✅
**Status**: All files updated

- ✅ `src/app/api/rooms/create/route.ts` - Sets `expires_at` explicitly
- ✅ `src/app/api/rooms/join/route.ts` - Checks expiry before allowing join
- ✅ `src/app/api/rooms/[roomId]/state/route.ts` - Checks expiry before returning state
- ✅ `src/app/api/rooms/code/[code]/route.ts` - Checks expiry before returning room

### Step 4: Set Up Scheduled Job (Option A: pg_cron) ✅
**Status**: Implemented in `database/v5.0_fix_room_expiry.sql`

```sql
-- Enable pg_cron extension
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule job to run every hour
SELECT cron.schedule(
  'expire-old-rooms',
  '0 * * * *',  -- Every hour at minute 0
  $$SELECT expire_old_rooms();$$
);

-- Verify job is scheduled
SELECT jobid, schedule, command, active 
FROM cron.job 
WHERE jobname = 'expire-old-rooms';
```

**If pg_cron is not available in Supabase:**
- Use Option B: Create `/api/cron/expire-rooms` endpoint
- Set up Vercel Cron Jobs or external cron service to call it hourly

### Step 5: Test
1. Create new room → Verify `expires_at` is set
2. Wait 24+ hours → Verify room becomes inactive
3. Try to join expired room → Verify rejection
4. Verify scheduled job runs successfully

---

## Files Modified ✅

1. ✅ **Database Migration**: `database/v5.0_fix_room_expiry.sql` (NEW)
   - Backfill existing rooms
   - Set default value for `expires_at`
   - Set up pg_cron scheduled job

2. ✅ **Room Creation**: `src/app/api/rooms/create/route.ts`
   - Explicitly sets `expires_at = created_at + 24 hours`

3. ✅ **Room Join**: `src/app/api/rooms/join/route.ts`
   - Checks if room has expired before allowing join
   - Returns 410 Gone if expired

4. ✅ **Room State**: `src/app/api/rooms/[roomId]/state/route.ts`
   - Checks if room has expired before returning state
   - Returns 410 Gone if expired

5. ✅ **Room Lookup**: `src/app/api/rooms/code/[code]/route.ts`
   - Checks if room has expired before returning room
   - Returns 410 Gone if expired

---

## Testing Checklist

- [ ] **Run Migration SQL**
  - [ ] Execute `database/v5.0_fix_room_expiry.sql` in Supabase SQL Editor
  - [ ] Verify backfill completed (check room counts)
  - [ ] Verify default value set (check column_default)
  - [ ] Verify scheduled job created (check cron.job table)

- [ ] **New Room Creation**
  - [ ] Create new room → Verify `expires_at` is set
  - [ ] Verify `expires_at = created_at + 24 hours` (within 1 second tolerance)

- [ ] **Room Expiry**
  - [ ] Wait 24+ hours OR manually set `expires_at` to past time
  - [ ] Verify scheduled job runs (check logs or manually call `expire_old_rooms()`)
  - [ ] Verify room becomes inactive (`is_active = false`)

- [ ] **Expired Room Access**
  - [ ] Try to join expired room → Verify returns 410 Gone
  - [ ] Try to get expired room state → Verify returns 410 Gone
  - [ ] Try to lookup expired room by code → Verify returns 410 Gone

- [ ] **Backfill Verification**
  - [ ] Old rooms (>24h) should be expired (`is_active = false`)
  - [ ] Recent rooms (<24h) should have proper `expires_at` set
  - [ ] No rooms should have `expires_at = NULL` after migration

---

## Notes

- ✅ The `expire_old_rooms()` function is well-designed and correct
- ✅ All fixes have been implemented and are ready for testing
- ✅ No breaking changes to existing functionality
- ✅ Expiry checks are defensive (check both `expires_at` and `is_active`)
- ✅ Room expiry happens both via scheduled job AND on access (defense in depth)

## Implementation Details

### Expiry Check Strategy

All room access endpoints now:
1. Check if `expires_at < NOW()` → If expired, mark as inactive and return 410
2. Check if `is_active = false` → Return 410 (defense in depth)

This ensures:
- Expired rooms are immediately marked inactive when accessed
- Scheduled job handles bulk expiry (hourly)
- Access checks handle edge cases (room accessed between scheduled runs)

### Migration Strategy

The migration uses **Immediate Expiry** approach:
- Old rooms (>24h) → Expired immediately (`is_active = false`)
- Recent rooms (<24h) → Get proper 24-hour expiry window
- Inactive rooms → Get `expires_at` set for consistency

This cleans up old rooms immediately while giving recent rooms proper expiry.

---

# User "Stuck in Room" Investigation
**Date**: 2026-01-24  
**Issue**: Users unable to join new rooms, stuck in same active room  
**Status**: Root causes identified

---

## Summary

Users are getting **stuck in rooms** and cannot join new rooms due to **3 critical issues**:

1. ❌ **Users can be participants in multiple rooms simultaneously** (no constraint)
2. ❌ **Auto-rejoin logic redirects to last room** even when trying to join new room
3. ❌ **No "leave room" functionality** to clean up old participations

---

## Root Cause Analysis

### Issue 1: Multiple Room Participations Allowed

**Database Evidence:**
```
user_id                                | room_count 
---------------------------------------+------------
91505c72-023a-4a6f-b005-546f94f72f62  |          6
d4188828-ad90-4ccb-8684-33c7ac8584ce  |          4
4cd60b9d-f509-4509-b146-7189d99effa2  |          4
```

**Problem:**
- Users can be participants in **multiple rooms at once**
- No database constraint preventing this
- `kara_room_participants` has `UNIQUE(room_id, user_id)` but allows same user in different rooms
- When user tries to join new room, they're still a participant in old rooms

**Current Schema:**
```sql
CREATE TABLE kara_room_participants (
  ...
  UNIQUE(room_id, user_id)  -- ✅ Prevents duplicate in SAME room
  -- ❌ But allows same user in DIFFERENT rooms
);
```

---

### Issue 2: Auto-Rejoin Logic Interferes

**File**: `src/app/join/page.tsx` (Lines 22-59)

**Current Code:**
```typescript
useEffect(() => {
  const checkLastRoom = async () => {
    const storedRoomCode = localStorage.getItem('current_room_code');
    const storedUserName = localStorage.getItem('user_display_name');
    
    if (storedRoomCode && storedUserName) {
      // Verify room still exists
      const roomData = await api.getRoomByCode(storedRoomCode);
      
      if (roomData && roomData.room) {
        // ❌ AUTO-REDIRECT to last room
        router.push(`/room/${storedRoomCode}`);
        return;
      }
    }
  };
  checkLastRoom();
}, []);
```

**Problem:**
- When user visits `/join`, it **automatically redirects** to last room if it exists
- User cannot manually enter a new room code
- Even if they want to join a different room, they get redirected back

**User Flow (Broken):**
```
1. User is in Room "ABC123"
2. User wants to join Room "XYZ789"
3. User navigates to /join
4. Auto-rejoin detects "ABC123" still exists
5. ❌ Redirects to /room/ABC123 (stuck!)
6. User never gets chance to enter "XYZ789"
```

---

### Issue 3: No Leave Room Functionality

**Missing:**
- No API endpoint to remove user from a room
- No UI button to "leave room"
- No cleanup when user joins new room
- Old participations accumulate in database

**Current Join Logic:**
```typescript
// src/app/api/rooms/join/route.ts (Line 88-117)
// Check if already participant in THIS room
const { data: existingParticipant } = await supabaseAdmin
  .from('kara_room_participants')
  .select('*')
  .eq('room_id', room.id)  // ✅ Only checks THIS room
  .eq('user_id', user.id)
  .single();

// ❌ Doesn't check if user is in OTHER rooms
// ❌ Doesn't remove user from old rooms
```

**Problem:**
- Join endpoint only checks if user is already in **target room**
- Doesn't check if user is in **other rooms**
- Doesn't clean up old participations
- User accumulates participations across multiple rooms

---

## Impact Assessment

### Current Behavior
1. ✅ User can join Room A
2. ✅ User can join Room B (while still in Room A)
3. ❌ User has participations in both rooms
4. ❌ Auto-rejoin always redirects to last room
5. ❌ User cannot manually join new room
6. ❌ Old participations never cleaned up

### Expected Behavior
1. ✅ User can join Room A
2. ✅ User can leave Room A
3. ✅ User can join Room B (Room A participation removed)
4. ✅ User can manually enter room code even if in another room
5. ✅ Only one active participation per user

---

## Fixes Required

### Fix 1: Add Leave Room Functionality

**New API Endpoint**: `src/app/api/rooms/[roomId]/leave/route.ts`
```typescript
export async function POST(request: NextRequest, { params }: { params: { roomId: string } }) {
  const { userId } = await request.json();
  
  // Remove user from room
  await supabaseAdmin
    .from('kara_room_participants')
    .delete()
    .eq('room_id', params.roomId)
    .eq('user_id', userId);
  
  return NextResponse.json({ success: true });
}
```

**Frontend Button**: Add "Leave Room" button in room page

### Fix 2: Auto-Leave Old Rooms on Join

**Update**: `src/app/api/rooms/join/route.ts`
```typescript
// After getting user, before joining new room:
// Remove user from all other active rooms
await supabaseAdmin
  .from('kara_room_participants')
  .delete()
  .eq('user_id', user.id)
  .neq('room_id', room.id);  // Keep only the new room

// Then proceed with joining new room...
```

**Alternative (Softer):** Only remove from rooms user hasn't been active in for X hours:
```typescript
// Remove from inactive rooms only
await supabaseAdmin
  .from('kara_room_participants')
  .delete()
  .eq('user_id', user.id)
  .neq('room_id', room.id)
  .lt('last_active_at', new Date(Date.now() - 60 * 60 * 1000).toISOString()); // 1 hour
```

### Fix 3: Fix Auto-Rejoin Logic

**Update**: `src/app/join/page.tsx`
```typescript
// Option A: Disable auto-rejoin entirely
// Remove the useEffect that auto-redirects

// Option B: Add "Join Different Room" button
// Show last room info but allow manual override

// Option C: Only auto-rejoin if user explicitly wants to
// Add checkbox: "Return to last room: ABC123"
```

**Recommended**: Option B - Show last room but allow override:
```typescript
const [showLastRoom, setShowLastRoom] = useState(false);
const [lastRoomCode, setLastRoomCode] = useState<string | null>(null);

useEffect(() => {
  const storedRoomCode = localStorage.getItem('current_room_code');
  if (storedRoomCode) {
    // Check if room still exists
    api.getRoomByCode(storedRoomCode).then(roomData => {
      if (roomData?.room) {
        setLastRoomCode(storedRoomCode);
        setShowLastRoom(true);  // Show option, don't auto-redirect
      }
    });
  }
}, []);

// In UI:
{showLastRoom && (
  <div>
    <p>Return to last room: {lastRoomCode}</p>
    <button onClick={() => router.push(`/room/${lastRoomCode}`)}>
      Return to {lastRoomCode}
    </button>
    <button onClick={() => setShowLastRoom(false)}>
      Join Different Room
    </button>
  </div>
)}
```

---

## Migration Plan

### Step 1: Clean Up Existing Multiple Participations

```sql
-- Find users in multiple rooms
SELECT user_id, COUNT(*) as room_count
FROM kara_room_participants
WHERE status = 'approved'
GROUP BY user_id
HAVING COUNT(*) > 1;

-- Option A: Keep only most recent room per user
WITH ranked_participations AS (
  SELECT 
    id,
    user_id,
    room_id,
    ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY last_active_at DESC) as rn
  FROM kara_room_participants
  WHERE status = 'approved'
)
DELETE FROM kara_room_participants
WHERE id IN (
  SELECT id FROM ranked_participations WHERE rn > 1
);

-- Option B: Keep only rooms user was active in last hour
DELETE FROM kara_room_participants
WHERE last_active_at < NOW() - INTERVAL '1 hour'
AND status = 'approved';
```

### Step 2: Add Leave Room Endpoint
- Create `src/app/api/rooms/[roomId]/leave/route.ts`
- Add "Leave Room" button to room page UI

### Step 3: Update Join Logic
- Modify `src/app/api/rooms/join/route.ts` to remove old participations
- Choose strategy: remove all or only inactive

### Step 4: Fix Auto-Rejoin
- Update `src/app/join/page.tsx` to show option instead of auto-redirect
- Allow manual room code entry

### Step 5: Test
1. Join Room A → Verify participation created
2. Join Room B → Verify Room A participation removed
3. Visit /join → Verify can enter new room code
4. Leave Room → Verify participation removed

---

## Files to Modify

1. **New API**: `src/app/api/rooms/[roomId]/leave/route.ts`
2. **Join API**: `src/app/api/rooms/join/route.ts` (add cleanup logic)
3. **Join Page**: `src/app/join/page.tsx` (fix auto-rejoin)
4. **Room Page**: `src/app/room/[code]/page.tsx` (add leave button)
5. **API Client**: `src/lib/api.ts` (add leaveRoom method)

---

## Testing Checklist

- [ ] User can join Room A
- [ ] User can join Room B (Room A participation removed)
- [ ] User can manually enter room code even if in another room
- [ ] Leave Room button removes participation
- [ ] Auto-rejoin shows option instead of forcing redirect
- [ ] Old participations cleaned up correctly
- [ ] Multiple participations migration successful

---

## Notes

- The multiple participation issue is a data integrity problem
- Auto-rejoin is too aggressive and prevents user choice
- Leave room functionality is missing entirely
- All fixes are straightforward and low-risk
