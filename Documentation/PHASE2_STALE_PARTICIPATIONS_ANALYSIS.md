# Phase 2: Stale Participations Analysis
**Date**: 2026-01-24  
**Issue**: Users forget to click "Leave Room" button  
**Status**: Analysis Complete - Solutions Proposed

---

## Problem Statement

**Scenario:**
1. User joins Room A
2. User closes browser or navigates away (forgets to click "Leave Room")
3. User is still a participant in Room A (stale participation)
4. If user never joins another room, they're stuck in Room A forever

**Current State:**
- **23 stale participations** in database (inactive > 24 hours)
- Oldest stale participation: **5 days** old
- `last_active_at` is only updated when **joining** a room, NOT when actively using it

---

## Current Behavior Analysis

### When `last_active_at` Gets Updated

**Currently Updated:**
1. ✅ When user **joins** a room (`/api/rooms/join`)
   - Line 115: Updates `last_active_at` if already participant

**NOT Updated:**
2. ❌ When user **fetches room state** (`/api/rooms/[roomId]/state`)
   - User actively using room page but `last_active_at` not updated
3. ❌ When user **polls for updates** (every 2.5-7.5 seconds)
   - No activity tracking
4. ❌ When user **adds songs to queue**
   - No activity tracking

**Result:**
- `last_active_at` only reflects when user **joined**, not when they were **last active**
- Stale participations accumulate (23 found in database)

---

## Current Auto-Cleanup Behavior

**In `/api/rooms/join` (Phase 2 implementation):**
```typescript
// Removes user from ALL other rooms before joining new one
await supabaseAdmin
  .from('kara_room_participants')
  .delete()
  .eq('user_id', user.id)
  .neq('room_id', room.id);
```

**Works When:**
- ✅ User joins Room B → Room A participation removed
- ✅ User explicitly leaves room → Participation removed

**Doesn't Work When:**
- ❌ User closes browser in Room A, never joins another room
- ❌ User forgets to click "Leave Room" button
- ❌ User switches devices (different fingerprint = different user_id)

---

## Proposed Solutions

### Solution 1: Smart Cleanup on Join (Recommended)

**Strategy**: Only remove **stale** participations (>24h inactive) when joining new room

**Benefits:**
- Keeps recent participations (user might return)
- Removes stale ones automatically
- No scheduled job needed
- Works immediately

**Implementation:**
```typescript
// In /api/rooms/join, before joining new room:
// Remove stale participations (>24 hours inactive)
const staleThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

await supabaseAdmin
  .from('kara_room_participants')
  .delete()
  .eq('user_id', user.id)
  .neq('room_id', room.id)
  .or(`last_active_at.is.null,last_active_at.lt.${staleThreshold}`);
```

**Behavior:**
- User joins Room B → Removes Room A only if Room A is stale (>24h)
- If Room A is recent (<24h), keeps both (user might return)
- When joining Room C, removes both A and B if stale

---

### Solution 2: Update `last_active_at` on Room State Fetch

**Strategy**: Track activity when user is actively using room

**Implementation:**
```typescript
// In /api/rooms/[roomId]/state, after fetching room:
// Update last_active_at if user is participant
if (userId) {
  await supabaseAdmin
    .from('kara_room_participants')
    .update({ last_active_at: new Date().toISOString() })
    .eq('room_id', roomId)
    .eq('user_id', userId);
}
```

**Benefits:**
- `last_active_at` accurately reflects actual activity
- Stale detection works correctly
- No user action required

**Considerations:**
- Adds database write on every state fetch (every 2.5-7.5 seconds)
- Could be expensive at scale
- Better: Update only once per minute (debounce)

---

### Solution 3: Scheduled Cleanup Job

**Strategy**: Background job removes stale participations periodically

**Implementation:**
```sql
-- Function to cleanup stale participations
CREATE OR REPLACE FUNCTION cleanup_stale_participations()
RETURNS void AS $$
BEGIN
  DELETE FROM kara_room_participants
  WHERE status = 'approved'
  AND (last_active_at < NOW() - INTERVAL '24 hours' OR last_active_at IS NULL)
  AND role != 'host';  -- Don't remove hosts (they own the room)
END;
$$ LANGUAGE plpgsql;

-- Schedule to run every hour
SELECT cron.schedule(
  'cleanup-stale-participations',
  '0 * * * *',
  $$SELECT cleanup_stale_participations();$$
);
```

**Benefits:**
- Automatic cleanup without user action
- Works even if user never joins another room
- Keeps database clean

**Considerations:**
- Requires pg_cron setup
- Runs in background (not immediate)

---

### Solution 4: Combination Approach (Best)

**Strategy**: Combine Solution 1 + Solution 2

**Implementation:**
1. **Update `last_active_at` on room state fetch** (debounced to once per minute)
   - Tracks actual activity
   - Accurate stale detection

2. **Smart cleanup on join** (only remove stale participations)
   - Removes stale ones when joining new room
   - Keeps recent ones (user might return)

3. **Optional: Scheduled cleanup** (for safety net)
   - Removes any remaining stale participations
   - Works even if user never joins another room

**Benefits:**
- Accurate activity tracking
- Immediate cleanup when joining new room
- Safety net for edge cases
- Best user experience

---

## Recommendation

**Use Solution 4 (Combination Approach):**

1. **Update `last_active_at` on room state fetch** (debounced)
   - File: `src/app/api/rooms/[roomId]/state/route.ts`
   - Update once per minute max (not every poll)

2. **Smart cleanup on join** (only stale participations)
   - File: `src/app/api/rooms/join/route.ts`
   - Remove only participations >24h inactive

3. **Scheduled cleanup job** (optional safety net)
   - File: `database/v4.9_cleanup_stale_participations.sql`
   - Runs hourly to catch edge cases

---

## Impact Assessment

### Current Problem
- 23 stale participations (5 days old)
- Users stuck in rooms they forgot about
- Database clutter

### After Solution 4
- ✅ Accurate activity tracking
- ✅ Automatic cleanup of stale participations
- ✅ Users can always join new rooms (stale ones removed)
- ✅ Database stays clean

---

## Implementation Plan

### Step 1: Update Activity Tracking
- Add `last_active_at` update to `/api/rooms/[roomId]/state`
- Debounce to once per minute (not every poll)

### Step 2: Smart Cleanup on Join
- Modify cleanup to only remove stale participations (>24h)
- Keep recent participations

### Step 3: Scheduled Cleanup (Optional)
- Create cleanup function
- Schedule with pg_cron (or external cron)

---

## Testing Scenarios

1. **User forgets to leave:**
   - Join Room A, close browser
   - Wait 25 hours
   - Join Room B → Room A should be removed (stale)

2. **User returns to same room:**
   - Join Room A, close browser
   - Wait 1 hour (not stale)
   - Join Room A again → Should rejoin (not removed)

3. **User switches rooms quickly:**
   - Join Room A
   - Join Room B 5 minutes later
   - Room A should be kept (recent, not stale)

---

## Questions to Consider

1. **Stale threshold**: 24 hours? 12 hours? 48 hours?
   - **Recommendation**: 24 hours (aligns with room expiry)

2. **Update frequency**: Every poll (2.5s) or debounced (1 min)?
   - **Recommendation**: Debounced to 1 minute (reduces DB writes)

3. **Host participations**: Should hosts be auto-removed?
   - **Recommendation**: No - hosts own the room, should stay

4. **Multiple recent rooms**: Keep all recent or only most recent?
   - **Recommendation**: Keep all recent (<24h), remove only stale

---

## Next Steps

1. **Decide on solution** (Recommendation: Solution 4)
2. **Choose stale threshold** (Recommendation: 24 hours)
3. **Implement changes** (after approval)
4. **Test thoroughly**
5. **Run migration** to clean up existing stale participations
