# 🧠 Phase III: Smart Features & Queue Intelligence

**Date:** 2026-01-13  
**Status:** ⏳ **PLANNING PHASE - NO IMPLEMENTATION YET**  
**Goal:** Add intelligent queue management, user preferences, and history features  
**Checkpoint:** `v2.0` (Phase II complete)

---

## 🎯 **Objectives**

### **Primary Goals:**
1. ✅ TV queue priority system (Round Robin vs First Come First Serve)
2. ✅ Device queue reordering (up/down arrows, reflects on TV)
3. ✅ User song history (recent 20 songs + full history tab)
4. ✅ User preferences system
5. ✅ Smart features to enhance user experience

### **Success Metrics:**
- Zero breaking changes to existing functionality
- Queue ordering works correctly for both modes
- History displays accurately
- Preferences persist across sessions
- Can revert to v2.0 in <5 minutes if needed

---

## 🛡️ **PHASE 0: Safety Net Setup**

**Duration:** 5 minutes  
**Risk:** None  
**Rollback:** `git checkout v2.0`

### **Step 0.1: Verify v2.0 Checkpoint**

```bash
# Verify v2.0 tag exists
git tag -l v2.0

# Verify we're on main branch
git branch

# Verify current state is clean
git status
```

**Success Criteria:**
- ✅ Tag `v2.0` exists
- ✅ On `main` branch
- ✅ Working directory clean

### **Step 0.2: Create Feature Branch**

```bash
# Create and switch to feature branch
git checkout -b feature/phase3-smart-features

# Verify branch
git branch
```

**Success Criteria:**
- ✅ On branch `feature/phase3-smart-features`
- ✅ Branch identical to main at this point
- ✅ Can switch back to main anytime: `git checkout main`

### **Step 0.3: Document Rollback Procedure**

**Note:** Rollback procedure already documented in `Documentation/ROLLBACK.md`  
**Update:** Add Phase III rollback instructions

---

## 📊 **PHASE 1: TV Queue Priority System**

**Duration:** 2-3 hours  
**Risk:** Medium (touches queue ordering logic)  
**Files:** 
- `database/schema.sql` (add `queue_mode` column)
- `src/app/api/rooms/create/route.ts` (accept queue_mode)
- `src/app/page.tsx` (room creation UI)
- `src/app/api/queue/add/route.ts` (use queue_mode for position)
- `src/server/lib/queue.ts` (round-robin logic)

### **Current State:**
- ❌ No queue priority system
- ❌ All songs added in simple FIFO order (max position + 1)
- ❌ No round-robin fairness

### **Target State:**
- ✅ Host selects queue mode during room creation
- ✅ Two modes: "Round Robin" (fair rotation) or "First Come First Serve" (FIFO)
- ✅ Round Robin: Each user gets one turn before anyone sings again
- ✅ FIFO: Songs play in order added (current behavior)
- ✅ Mode stored in `kara_rooms.queue_mode` column
- ✅ Queue position calculated based on mode

### **Step 1.1: Database Schema Update**

**File:** `database/schema.sql`

**Add Column:**
```sql
-- Add queue_mode to kara_rooms table
ALTER TABLE kara_rooms 
ADD COLUMN IF NOT EXISTS queue_mode VARCHAR(20) DEFAULT 'fifo' 
CHECK (queue_mode IN ('round_robin', 'fifo'));

-- Add comment
COMMENT ON COLUMN kara_rooms.queue_mode IS 
  'Queue ordering mode: round_robin (fair rotation) or fifo (first come first serve)';
```

**Migration Script:** `database/add_queue_mode.sql`

```sql
-- Migration: Add queue_mode to kara_rooms
-- Safe to run on existing database (adds column with default)

ALTER TABLE kara_rooms 
ADD COLUMN IF NOT EXISTS queue_mode VARCHAR(20) DEFAULT 'fifo' 
CHECK (queue_mode IN ('round_robin', 'fifo'));

-- Update existing rooms to have explicit mode
UPDATE kara_rooms 
SET queue_mode = 'fifo' 
WHERE queue_mode IS NULL;
```

**Success Criteria:**
- ✅ Column added to schema
- ✅ Migration script created
- ✅ Default value is 'fifo' (maintains current behavior)
- ✅ Check constraint enforces valid values

### **Step 1.2: Update Room Creation API**

**File:** `src/app/api/rooms/create/route.ts`

**Current:**
```typescript
const { room_name, host_fingerprint, host_display_name } = body;
```

**New:**
```typescript
const { room_name, host_fingerprint, host_display_name, queue_mode } = body;

// Validate queue_mode
const validModes = ['round_robin', 'fifo'];
const selectedMode = queue_mode && validModes.includes(queue_mode) 
  ? queue_mode 
  : 'fifo'; // Default to FIFO
```

**Update Room Insert:**
```typescript
const { data: room, error: roomError } = await supabaseAdmin
  .from('kara_rooms')
  .insert({
    room_code: roomCode,
    room_name,
    host_id: user.id,
    queue_mode: selectedMode, // ← Add this
  })
  .select()
  .single();
```

**Update TypeScript Types:**
**File:** `src/shared/types.ts`

```typescript
export interface Room {
  id: string;
  room_code: string;
  room_name: string;
  host_id: string | null;
  created_at: string;
  updated_at: string;
  is_active: boolean;
  subscription_tier: string;
  expires_at: string | null;
  current_entry_id: string | null;
  last_singer_id: string | null;
  queue_mode: 'round_robin' | 'fifo'; // ← Add this
}

export interface CreateRoomRequest {
  room_name: string;
  host_fingerprint: string;
  host_display_name?: string;
  queue_mode?: 'round_robin' | 'fifo'; // ← Add this (optional, defaults to 'fifo')
}
```

**Success Criteria:**
- ✅ API accepts `queue_mode` parameter
- ✅ Validates mode (defaults to 'fifo' if invalid)
- ✅ Stores mode in database
- ✅ TypeScript types updated

### **Step 1.3: Update Room Creation UI**

**File:** `src/app/page.tsx`

**Add Queue Mode Selection:**

```tsx
const [queueMode, setQueueMode] = useState<'round_robin' | 'fifo'>('fifo');

// Add to JSX, after room name input:
<div style={{ marginBottom: '1.5rem' }}>
  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>
    Queue Ordering Mode
  </label>
  
  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
    <label style={{ display: 'flex', alignItems: 'flex-start', cursor: 'pointer', padding: '0.75rem', border: '1px solid #ddd', borderRadius: '4px', backgroundColor: queueMode === 'fifo' ? '#f0f8ff' : 'transparent' }}>
      <input
        type="radio"
        name="queueMode"
        value="fifo"
        checked={queueMode === 'fifo'}
        onChange={(e) => setQueueMode(e.target.value as 'fifo')}
        style={{ marginRight: '0.5rem', marginTop: '0.2rem' }}
      />
      <div>
        <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>
          First Come First Serve
        </div>
        <div style={{ fontSize: '0.85rem', color: '#666' }}>
          Songs play in the order they were added. Simple and straightforward.
        </div>
      </div>
    </label>
    
    <label style={{ display: 'flex', alignItems: 'flex-start', cursor: 'pointer', padding: '0.75rem', border: '1px solid #ddd', borderRadius: '4px', backgroundColor: queueMode === 'round_robin' ? '#f0f8ff' : 'transparent' }}>
      <input
        type="radio"
        name="queueMode"
        value="round_robin"
        checked={queueMode === 'round_robin'}
        onChange={(e) => setQueueMode(e.target.value as 'round_robin')}
        style={{ marginRight: '0.5rem', marginTop: '0.2rem' }}
      />
      <div>
        <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>
          Round Robin (Fair Rotation)
        </div>
        <div style={{ fontSize: '0.85rem', color: '#666' }}>
          Each person gets one turn before anyone sings again. Ensures everyone gets equal opportunities.
        </div>
      </div>
    </label>
  </div>
</div>
```

**Update API Call:**
```typescript
const { room } = await api.createRoom({
  room_name: roomName,
  host_fingerprint: fingerprint,
  host_display_name: displayName || 'Host',
  queue_mode: queueMode, // ← Add this
});
```

**Success Criteria:**
- ✅ Radio buttons for mode selection
- ✅ Clear descriptions for each mode
- ✅ Visual feedback (highlight selected)
- ✅ Mode sent to API

### **Step 1.4: Implement Round-Robin Queue Position Logic**

**File:** `src/app/api/queue/add/route.ts`

**Current Logic (FIFO):**
```typescript
// Simple max + 1
const position = (maxPosData?.position || 0) + 1;
```

**New Logic (Mode-Aware):**

```typescript
// 1. Get room's queue_mode
const { data: room } = await supabaseAdmin
  .from('kara_rooms')
  .select('queue_mode, last_singer_id')
  .eq('id', room_id)
  .single();

const queueMode = room?.queue_mode || 'fifo';

let position: number;

if (queueMode === 'fifo') {
  // FIFO: Simple max + 1 (current behavior)
  const { data: maxPosData } = await supabaseAdmin
    .from('kara_queue')
    .select('position')
    .eq('room_id', room_id)
    .in('status', ['pending', 'playing'])
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle();
  
  position = (maxPosData?.position || 0) + 1;
  
} else {
  // Round Robin: Find next position for this user's turn
  // Logic:
  // 1. Get all pending songs, grouped by user
  // 2. Find which users have already sung in current round
  // 3. If this user hasn't sung yet this round, add at end of current round
  // 4. If this user already sang, add at end of next round
  
  const { data: pendingSongs } = await supabaseAdmin
    .from('kara_queue')
    .select('user_id, position, round_number')
    .eq('room_id', room_id)
    .eq('status', 'pending')
    .order('position', { ascending: true });
  
  if (!pendingSongs || pendingSongs.length === 0) {
    // First song in queue
    position = 1;
  } else {
    // Find current round number (max round_number of pending songs)
    const currentRound = Math.max(...pendingSongs.map(s => s.round_number || 1));
    
    // Check if this user has a song in current round
    const userInCurrentRound = pendingSongs.some(
      s => s.user_id === user_id && (s.round_number || 1) === currentRound
    );
    
    if (!userInCurrentRound) {
      // User hasn't sung in current round - add at end of current round
      const currentRoundSongs = pendingSongs.filter(
        s => (s.round_number || 1) === currentRound
      );
      const maxPosInRound = Math.max(...currentRoundSongs.map(s => s.position));
      position = maxPosInRound + 1;
    } else {
      // User already sang in current round - add at end of next round
      const maxPosition = Math.max(...pendingSongs.map(s => s.position));
      position = maxPosition + 1;
    }
  }
}
```

**Update Insert:**
```typescript
// Calculate round_number for round-robin mode
const roundNumber = queueMode === 'round_robin' 
  ? (() => {
      // Get current round from pending songs
      const { data: pending } = await supabaseAdmin
        .from('kara_queue')
        .select('round_number')
        .eq('room_id', room_id)
        .eq('status', 'pending')
        .order('round_number', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      const currentRound = pending?.round_number || 1;
      
      // Check if user already in current round
      const { data: userInRound } = await supabaseAdmin
        .from('kara_queue')
        .select('id')
        .eq('room_id', room_id)
        .eq('user_id', user_id)
        .eq('status', 'pending')
        .eq('round_number', currentRound)
        .limit(1)
        .maybeSingle();
      
      return userInRound ? currentRound + 1 : currentRound;
    })()
  : 1; // FIFO doesn't use rounds

const { data, error } = await supabaseAdmin
  .from('kara_queue')
  .insert({
    room_id,
    version_id,
    user_id,
    position,
    round_number: roundNumber, // ← Add this
    status: 'pending'
  })
  .select()
  .single();
```

**Note:** This logic is complex. Consider creating a PostgreSQL function for round-robin position calculation to ensure atomicity.

**Alternative: PostgreSQL Function (Recommended)**

**File:** `database/calculate_round_robin_position.sql`

```sql
CREATE OR REPLACE FUNCTION calculate_round_robin_position(
    p_room_id UUID,
    p_user_id UUID
)
RETURNS INTEGER AS $$
DECLARE
    v_queue_mode VARCHAR(20);
    v_current_round INTEGER;
    v_user_in_round BOOLEAN;
    v_max_position INTEGER;
    v_new_position INTEGER;
BEGIN
    -- Get room's queue mode
    SELECT queue_mode INTO v_queue_mode
    FROM kara_rooms
    WHERE id = p_room_id;
    
    -- If FIFO or mode not set, use simple max + 1
    IF v_queue_mode IS NULL OR v_queue_mode = 'fifo' THEN
        SELECT COALESCE(MAX(position), 0) + 1 INTO v_new_position
        FROM kara_queue
        WHERE room_id = p_room_id
        AND status IN ('pending', 'playing');
        
        RETURN v_new_position;
    END IF;
    
    -- Round Robin logic
    -- Get current round (max round_number of pending songs)
    SELECT COALESCE(MAX(round_number), 1) INTO v_current_round
    FROM kara_queue
    WHERE room_id = p_room_id
    AND status = 'pending';
    
    -- Check if user has song in current round
    SELECT EXISTS(
        SELECT 1
        FROM kara_queue
        WHERE room_id = p_room_id
        AND user_id = p_user_id
        AND status = 'pending'
        AND round_number = v_current_round
    ) INTO v_user_in_round;
    
    IF NOT v_user_in_round THEN
        -- User hasn't sung in current round - add at end of current round
        SELECT COALESCE(MAX(position), 0) + 1 INTO v_new_position
        FROM kara_queue
        WHERE room_id = p_room_id
        AND status = 'pending'
        AND round_number = v_current_round;
        
        -- If no songs in current round, start at position 1
        IF v_new_position IS NULL THEN
            v_new_position := 1;
        END IF;
    ELSE
        -- User already sang in current round - add at end of queue (next round)
        SELECT COALESCE(MAX(position), 0) + 1 INTO v_new_position
        FROM kara_queue
        WHERE room_id = p_room_id
        AND status IN ('pending', 'playing');
    END IF;
    
    RETURN v_new_position;
END;
$$ LANGUAGE plpgsql;
```

**Update API to Use Function:**
```typescript
// Call PostgreSQL function for position calculation
const { data: positionData, error: posError } = await supabaseAdmin
  .rpc('calculate_round_robin_position', {
    p_room_id: room_id,
    p_user_id: user_id
  });

if (posError) {
  throw new Error(`Failed to calculate position: ${posError.message}`);
}

const position = positionData as number;
```

**Success Criteria:**
- ✅ FIFO mode works (current behavior maintained)
- ✅ Round-robin mode calculates correct position
- ✅ Users get fair rotation
- ✅ Position calculation is atomic (PostgreSQL function)

### **Step 1.5: Update Queue Schema for Round Number**

**File:** `database/schema.sql`

**Verify Column Exists:**
```sql
-- kara_queue should already have round_number column
-- Verify it exists, add if missing
ALTER TABLE kara_queue 
ADD COLUMN IF NOT EXISTS round_number INTEGER DEFAULT 1;
```

**Success Criteria:**
- ✅ `round_number` column exists
- ✅ Default value is 1

### **Step 1.6: Testing**

**Test Cases:**
1. **FIFO Mode:**
   - [ ] Create room with FIFO mode
   - [ ] Add songs from multiple users
   - [ ] Verify songs play in order added

2. **Round Robin Mode:**
   - [ ] Create room with Round Robin mode
   - [ ] User A adds 3 songs
   - [ ] User B adds 2 songs
   - [ ] User C adds 1 song
   - [ ] Verify order: A1, B1, C1, A2, B2, A3

3. **Mode Persistence:**
   - [ ] Create room with specific mode
   - [ ] Reload page
   - [ ] Verify mode is still set

**Success Criteria:**
- ✅ All test cases pass
- ✅ No regressions in existing functionality

---

## 📱 **PHASE 2: Device Queue Reordering**

**Duration:** 2-3 hours  
**Risk:** Medium (touches queue position logic)  
**Files:**
- `src/app/room/[code]/page.tsx` (add up/down buttons)
- `src/app/api/queue/item/[queueItemId]/reorder/route.ts` (new endpoint)
- `src/lib/api.ts` (add reorder method)

### **Current State:**
- ❌ Users cannot reorder their own songs
- ❌ Songs stay in order added

### **Target State:**
- ✅ Up/down arrows next to trash can icon
- ✅ Users can reorder their own songs
- ✅ Changes reflect immediately on TV
- ✅ Only pending songs can be reordered
- ✅ Position updates atomically

### **Step 2.1: Create Reorder API Endpoint**

**New File:** `src/app/api/queue/item/[queueItemId]/reorder/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/server/lib/supabase';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/queue/item/[queueItemId]/reorder
 * 
 * Reorder a queue item (user can only reorder their own songs)
 * 
 * Body: { direction: 'up' | 'down', user_id: string }
 * 
 * Rules:
 * - Can only reorder songs in 'pending' status
 * - User can only reorder their own songs
 * - Cannot reorder if it would conflict with other users' songs
 * - Changes position atomically
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { queueItemId: string } }
) {
  try {
    const { queueItemId } = params;
    const body = await request.json();
    const { direction, user_id } = body;
    
    if (!direction || !user_id) {
      return NextResponse.json(
        { error: 'direction and user_id are required' },
        { status: 400 }
      );
    }
    
    if (direction !== 'up' && direction !== 'down') {
      return NextResponse.json(
        { error: 'direction must be "up" or "down"' },
        { status: 400 }
      );
    }
    
    // 1. Get queue item and verify ownership
    const { data: queueItem, error: fetchError } = await supabaseAdmin
      .from('kara_queue')
      .select('id, user_id, room_id, position, status')
      .eq('id', queueItemId)
      .single();
    
    if (fetchError || !queueItem) {
      return NextResponse.json(
        { error: 'Queue item not found' },
        { status: 404 }
      );
    }
    
    // 2. Verify ownership
    if (queueItem.user_id !== user_id) {
      return NextResponse.json(
        { error: 'You can only reorder your own songs' },
        { status: 403 }
      );
    }
    
    // 3. Verify status (can only reorder pending)
    if (queueItem.status !== 'pending') {
      return NextResponse.json(
        { error: 'Can only reorder pending songs' },
        { status: 400 }
      );
    }
    
    // 4. Get all pending songs for this room, ordered by position
    const { data: allPending, error: pendingError } = await supabaseAdmin
      .from('kara_queue')
      .select('id, user_id, position')
      .eq('room_id', queueItem.room_id)
      .eq('status', 'pending')
      .order('position', { ascending: true });
    
    if (pendingError || !allPending) {
      return NextResponse.json(
        { error: 'Failed to fetch queue' },
        { status: 500 }
      );
    }
    
    // 5. Filter to only this user's songs (for reordering)
    const userSongs = allPending.filter(s => s.user_id === user_id);
    const currentIndex = userSongs.findIndex(s => s.id === queueItemId);
    
    if (currentIndex === -1) {
      return NextResponse.json(
        { error: 'Queue item not found in user songs' },
        { status: 404 }
      );
    }
    
    // 6. Calculate target index
    let targetIndex: number;
    if (direction === 'up') {
      targetIndex = currentIndex - 1;
      if (targetIndex < 0) {
        return NextResponse.json(
          { error: 'Already at top' },
          { status: 400 }
        );
      }
    } else {
      targetIndex = currentIndex + 1;
      if (targetIndex >= userSongs.length) {
        return NextResponse.json(
          { error: 'Already at bottom' },
          { status: 400 }
        );
      }
    }
    
    const targetSong = userSongs[targetIndex];
    
    // 7. Swap positions
    // We need to swap positions between current item and target item
    // But we must ensure we're only swapping within user's songs
    
    // Get the two positions
    const currentPos = queueItem.position;
    const targetPos = targetSong.position;
    
    // Swap: Use PostgreSQL function for atomicity
    // Or do it in a transaction
    
    // Option A: Use existing host_reorder_queue function (if it allows user reordering)
    // Option B: Create new user_reorder_queue function
    // Option C: Do swap in application code (less safe)
    
    // For now, use simple swap (will improve with PostgreSQL function)
    const { error: swapError } = await supabaseAdmin.rpc('swap_queue_positions', {
      p_room_id: queueItem.room_id,
      p_item1_id: queueItemId,
      p_item2_id: targetSong.id
    });
    
    if (swapError) {
      // Fallback: Manual swap
      // Update current item to target position (temporarily use negative)
      await supabaseAdmin
        .from('kara_queue')
        .update({ position: -currentPos })
        .eq('id', queueItemId);
      
      // Update target item to current position
      await supabaseAdmin
        .from('kara_queue')
        .update({ position: currentPos })
        .eq('id', targetSong.id);
      
      // Update current item to target position
      await supabaseAdmin
        .from('kara_queue')
        .update({ position: targetPos })
        .eq('id', queueItemId);
    }
    
    return NextResponse.json({
      success: true,
      message: `Song moved ${direction}`
    });
    
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    console.error('[queue/reorder] Error:', error);
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
```

**Better Approach: PostgreSQL Function**

**File:** `database/user_reorder_queue.sql`

```sql
CREATE OR REPLACE FUNCTION user_reorder_queue(
    p_queue_item_id UUID,
    p_user_id UUID,
    p_direction VARCHAR(4) -- 'up' or 'down'
)
RETURNS BOOLEAN AS $$
DECLARE
    v_queue_item RECORD;
    v_room_id UUID;
    v_user_songs RECORD[];
    v_current_index INTEGER;
    v_target_index INTEGER;
    v_target_song RECORD;
    v_temp_position INTEGER;
BEGIN
    -- Get queue item and verify ownership
    SELECT * INTO v_queue_item
    FROM kara_queue
    WHERE id = p_queue_item_id
    AND user_id = p_user_id
    AND status = 'pending'
    FOR UPDATE;
    
    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;
    
    v_room_id := v_queue_item.room_id;
    
    -- Get all user's pending songs, ordered by position
    SELECT ARRAY_AGG(
        ROW(id, position)::RECORD
        ORDER BY position
    ) INTO v_user_songs
    FROM kara_queue
    WHERE room_id = v_room_id
    AND user_id = p_user_id
    AND status = 'pending';
    
    -- Find current index
    v_current_index := array_position(
        (SELECT ARRAY_AGG(id ORDER BY position) FROM kara_queue 
         WHERE room_id = v_room_id AND user_id = p_user_id AND status = 'pending'),
        p_queue_item_id
    );
    
    -- Calculate target index
    IF p_direction = 'up' THEN
        v_target_index := v_current_index - 1;
        IF v_target_index < 1 THEN
            RETURN FALSE; -- Already at top
        END IF;
    ELSE
        v_target_index := v_current_index + 1;
        IF v_target_index > array_length(v_user_songs, 1) THEN
            RETURN FALSE; -- Already at bottom
        END IF;
    END IF;
    
    -- Get target song
    SELECT * INTO v_target_song
    FROM kara_queue
    WHERE room_id = v_room_id
    AND user_id = p_user_id
    AND status = 'pending'
    ORDER BY position
    OFFSET v_target_index - 1
    LIMIT 1;
    
    -- Swap positions
    v_temp_position := v_queue_item.position;
    
    UPDATE kara_queue
    SET position = v_target_song.position
    WHERE id = p_queue_item_id;
    
    UPDATE kara_queue
    SET position = v_temp_position
    WHERE id = v_target_song.id;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;
```

**Success Criteria:**
- ✅ Endpoint created
- ✅ Ownership verification works
- ✅ Position swap is atomic
- ✅ Only pending songs can be reordered

### **Step 2.2: Add Reorder UI to Device Page**

**File:** `src/app/room/[code]/page.tsx`

**Add Up/Down Buttons:**

```tsx
// Add state for reordering
const [reorderingId, setReorderingId] = useState<string | null>(null);

// Add handler
const handleReorder = async (queueItemId: string, direction: 'up' | 'down') => {
  if (!user) return;
  
  setReorderingId(queueItemId);
  
  try {
    await api.reorderQueueItem(queueItemId, direction, user.id);
    // Refresh room state to see updated positions
    await refreshRoomState();
    showSuccess('Song moved successfully');
  } catch (error: any) {
    showError(error.message || 'Failed to reorder song');
  } finally {
    setReorderingId(null);
  }
};

// Update queue item display
{userQueue.map((item, index) => (
  <div key={item.id} className="queue-item" style={{ /* existing styles */ }}>
    {/* Position badge */}
    <div className="position-badge">#{getPositionInQueue(item.id)}</div>
    
    {/* Song info */}
    <div className="song-info">
      <div className="title">{item.song?.title}</div>
      <div className="artist">{item.song?.artist || 'Unknown'}</div>
    </div>
    
    {/* Controls */}
    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
      {/* Up arrow */}
      <button
        className="btn-icon"
        onClick={() => handleReorder(item.id, 'up')}
        disabled={reorderingId === item.id || index === 0}
        style={{
          minWidth: '44px',
          minHeight: '44px',
          fontSize: '1.2rem',
          opacity: index === 0 ? 0.5 : 1,
        }}
        title="Move up"
      >
        ⬆️
      </button>
      
      {/* Down arrow */}
      <button
        className="btn-icon"
        onClick={() => handleReorder(item.id, 'down')}
        disabled={reorderingId === item.id || index === userQueue.length - 1}
        style={{
          minWidth: '44px',
          minHeight: '44px',
          fontSize: '1.2rem',
          opacity: index === userQueue.length - 1 ? 0.5 : 1,
        }}
        title="Move down"
      >
        ⬇️
      </button>
      
      {/* Trash can */}
      <button
        className="btn-icon btn-danger"
        onClick={() => handleRemoveFromQueue(item.id)}
        disabled={removingFromQueue === item.id}
        style={{
          minWidth: '44px',
          minHeight: '44px',
          fontSize: '1.2rem',
          backgroundColor: '#dc3545',
          color: 'white',
        }}
        title="Remove"
      >
        🗑️
      </button>
    </div>
  </div>
))}
```

**Update API Client:**
**File:** `src/lib/api.ts`

```typescript
async reorderQueueItem(
  queueItemId: string, 
  direction: 'up' | 'down', 
  userId: string
): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/queue/item/${queueItemId}/reorder`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ direction, user_id: userId }),
  });
  
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Failed to reorder: ${res.status}`);
  }
  
  return res.json();
},
```

**Success Criteria:**
- ✅ Up/down buttons visible
- ✅ Buttons disabled at top/bottom
- ✅ Reordering works
- ✅ Changes reflect on TV immediately
- ✅ Loading states work

### **Step 2.3: Testing**

**Test Cases:**
1. **Basic Reordering:**
   - [ ] User has 3 songs in queue
   - [ ] Move middle song up → becomes first
   - [ ] Move it down → back to middle

2. **Edge Cases:**
   - [ ] Cannot move first song up
   - [ ] Cannot move last song down
   - [ ] Cannot reorder other users' songs

3. **TV Sync:**
   - [ ] Reorder on device
   - [ ] Verify TV queue updates within 2.5s

**Success Criteria:**
- ✅ All test cases pass
- ✅ No regressions

---

## 🧠 **PHASE 3: Memory & Smart Features**

**Duration:** 3-4 hours  
**Risk:** Low (mostly new features, minimal changes to existing)  
**Files:**
- `database/schema.sql` (user preferences table)
- `src/app/api/users/[userId]/preferences/route.ts` (new)
- `src/app/api/users/[userId]/history/route.ts` (new)
- `src/app/room/[code]/page.tsx` (add History tab)

### **Current State:**
- ❌ No user preferences
- ❌ History exists but not easily accessible
- ❌ No smart recommendations

### **Target State:**
- ✅ User preferences (language, default version type)
- ✅ Recent 20 songs displayed
- ✅ Full history tab (12 months)
- ✅ Smart suggestions (frequently sung songs)

### **Step 3.1: User Preferences System**

**Database Schema:**
**File:** `database/schema.sql`

```sql
-- User preferences table
CREATE TABLE IF NOT EXISTS kara_user_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES kara_users(id) ON DELETE CASCADE,
    preferred_language VARCHAR(10) DEFAULT 'en',
    preferred_version_type VARCHAR(20), -- 'nam', 'nu', 'nam_nu', etc.
    auto_add_favorite BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id)
);

-- Index
CREATE INDEX IF NOT EXISTS idx_user_preferences_user ON kara_user_preferences(user_id);
```

**API Endpoint:**
**New File:** `src/app/api/users/[userId]/preferences/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/server/lib/supabase';

export const dynamic = 'force-dynamic';

/**
 * GET /api/users/[userId]/preferences
 * Get user preferences
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    const { userId } = params;
    
    const { data, error } = await supabaseAdmin
      .from('kara_user_preferences')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    
    if (error && error.code !== 'PGRST116') { // PGRST116 = not found
      throw error;
    }
    
    // Return defaults if not found
    return NextResponse.json({
      preferences: data || {
        preferred_language: 'en',
        preferred_version_type: null,
        auto_add_favorite: false,
      }
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/users/[userId]/preferences
 * Update user preferences
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    const { userId } = params;
    const body = await request.json();
    const { preferred_language, preferred_version_type, auto_add_favorite } = body;
    
    const { data, error } = await supabaseAdmin
      .from('kara_user_preferences')
      .upsert({
        user_id: userId,
        preferred_language: preferred_language || 'en',
        preferred_version_type: preferred_version_type || null,
        auto_add_favorite: auto_add_favorite || false,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id'
      })
      .select()
      .single();
    
    if (error) {
      throw error;
    }
    
    return NextResponse.json({ preferences: data });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
```

**Success Criteria:**
- ✅ Preferences table created
- ✅ API endpoints work
- ✅ Defaults returned if no preferences

### **Step 3.2: Recent Songs Display**

**File:** `src/app/room/[code]/page.tsx`

**Add Recent Songs Section:**

```tsx
// Add state
const [recentSongs, setRecentSongs] = useState<SongHistory[]>([]);

// Fetch recent songs
useEffect(() => {
  if (!user) return;
  
  const fetchRecentSongs = async () => {
    try {
      const { history } = await api.getUserRecentSongs(user.id, 20);
      setRecentSongs(history.slice(0, 20));
    } catch (error) {
      console.error('Failed to fetch recent songs:', error);
    }
  };
  
  fetchRecentSongs();
}, [user]);

// Display in UI (add to search results area or separate section)
{recentSongs.length > 0 && (
  <div style={{ marginTop: '2rem' }}>
    <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>
      🎵 Your Recent Songs (Last 20)
    </h3>
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {recentSongs.map((historyItem) => (
        <button
          key={historyItem.id}
          className="card"
          onClick={() => handleAddRecentSong(historyItem.song_id)}
          style={{ textAlign: 'left', padding: '0.75rem' }}
        >
          <div style={{ fontWeight: 600 }}>{historyItem.song?.title}</div>
          <div style={{ fontSize: '0.85rem', color: '#666' }}>
            {historyItem.song?.artist || 'Unknown'} • {formatDate(historyItem.sung_at)}
          </div>
        </button>
      ))}
    </div>
  </div>
)}
```

**API Method:**
**File:** `src/lib/api.ts`

```typescript
async getUserRecentSongs(userId: string, limit: number = 20): Promise<{ history: any[] }> {
  const res = await fetch(`${API_BASE}/users/${userId}/history/recent?limit=${limit}`);
  if (!res.ok) throw new Error('Failed to fetch recent songs');
  return res.json();
},
```

**API Endpoint:**
**New File:** `src/app/api/users/[userId]/history/recent/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/server/lib/supabase';

export const dynamic = 'force-dynamic';

/**
 * GET /api/users/[userId]/history/recent?limit=20
 * Get user's most recent songs (across all rooms)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    const { userId } = params;
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    
    const { data: history, error } = await supabaseAdmin
      .from('kara_song_history')
      .select(`
        *,
        kara_songs(*)
      `)
      .eq('user_id', userId)
      .order('sung_at', { ascending: false })
      .limit(limit);
    
    if (error) {
      throw error;
    }
    
    // Map kara_songs to song
    const mapped = (history || []).map(item => ({
      ...item,
      song: (item as any).kara_songs,
    }));
    
    return NextResponse.json({ history: mapped });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
```

**Success Criteria:**
- ✅ Recent 20 songs displayed
- ✅ Click to add to queue
- ✅ Shows date sung

### **Step 3.3: History Tab**

**File:** `src/app/room/[code]/page.tsx`

**Add History Tab:**

```tsx
// Add tab state
const [activeTab, setActiveTab] = useState<'search' | 'queue' | 'history'>('search');

// Add history state
const [history, setHistory] = useState<SongHistory[]>([]);
const [historyLoading, setHistoryLoading] = useState(false);

// Fetch history
const fetchHistory = async () => {
  if (!user || !room) return;
  
  setHistoryLoading(true);
  try {
    const { history: historyData } = await api.getUserHistory(user.id, room.id);
    // Filter to last 12 months
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
    
    const filtered = historyData.filter((item: SongHistory) => {
      const sungAt = new Date(item.sung_at);
      return sungAt >= twelveMonthsAgo;
    });
    
    setHistory(filtered);
  } catch (error) {
    showError('Failed to load history');
  } finally {
    setHistoryLoading(false);
  }
};

// Add tab button
<div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
  <button
    className={activeTab === 'search' ? 'btn btn-primary' : 'btn btn-secondary'}
    onClick={() => setActiveTab('search')}
  >
    Search
  </button>
  <button
    className={activeTab === 'queue' ? 'btn btn-primary' : 'btn btn-secondary'}
    onClick={() => setActiveTab('queue')}
  >
    Queue
  </button>
  <button
    className={activeTab === 'history' ? 'btn btn-primary' : 'btn btn-secondary'}
    onClick={() => {
      setActiveTab('history');
      fetchHistory();
    }}
  >
    History
  </button>
</div>

// History tab content
{activeTab === 'history' && (
  <div>
    {historyLoading ? (
      <div>Loading history...</div>
    ) : history.length === 0 ? (
      <div style={{ textAlign: 'center', padding: '2rem', color: '#666' }}>
        No history found. Start singing to build your history!
      </div>
    ) : (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {history.map((item) => (
          <div key={item.id} className="card" style={{ padding: '0.75rem' }}>
            <div style={{ fontWeight: 600 }}>{item.song?.title}</div>
            <div style={{ fontSize: '0.85rem', color: '#666' }}>
              {item.song?.artist || 'Unknown'} • {formatDate(item.sung_at)} • 
              {item.times_sung > 1 && ` (${item.times_sung} times)`}
            </div>
            <button
              className="btn btn-sm"
              onClick={() => handleAddFromHistory(item.song_id)}
              style={{ marginTop: '0.5rem' }}
            >
              Add to Queue
            </button>
          </div>
        ))}
      </div>
    )}
  </div>
)}
```

**API Method:**
**File:** `src/lib/api.ts`

```typescript
async getUserHistory(userId: string, roomId: string): Promise<{ history: any[] }> {
  const res = await fetch(`${API_BASE}/users/${userId}/history?room_id=${roomId}`);
  if (!res.ok) throw new Error('Failed to fetch history');
  return res.json();
},
```

**API Endpoint:**
**New File:** `src/app/api/users/[userId]/history/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/server/lib/supabase';

export const dynamic = 'force-dynamic';

/**
 * GET /api/users/[userId]/history?room_id=xxx
 * Get user's song history (optionally filtered by room)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    const { userId } = params;
    const { searchParams } = new URL(request.url);
    const roomId = searchParams.get('room_id');
    
    let query = supabaseAdmin
      .from('kara_song_history')
      .select(`
        *,
        kara_songs(*)
      `)
      .eq('user_id', userId)
      .order('sung_at', { ascending: false });
    
    if (roomId) {
      query = query.eq('room_id', roomId);
    }
    
    const { data: history, error } = await query;
    
    if (error) {
      throw error;
    }
    
    // Map kara_songs to song
    const mapped = (history || []).map(item => ({
      ...item,
      song: (item as any).kara_songs,
    }));
    
    return NextResponse.json({ history: mapped });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
```

**Success Criteria:**
- ✅ History tab added
- ✅ Shows last 12 months
- ✅ Can add songs from history
- ✅ Shows times sung

### **Step 3.4: Smart Suggestions**

**Ideas for Smart Features:**

1. **Frequently Sung Songs:**
   - Show top 10 songs user has sung most
   - Quick-add button

2. **Similar Songs:**
   - Based on artist/genre
   - "You might also like..."

3. **Time-Based Suggestions:**
   - "Popular this week"
   - "Recently added"

4. **Version Recommendations:**
   - Based on user's preferred version type
   - Highlight recommended versions

**Implementation (Optional - Phase 3.5):**

Create `src/app/api/users/[userId]/suggestions/route.ts`:

```typescript
// Get frequently sung songs
const { data: frequent } = await supabaseAdmin
  .from('kara_song_history')
  .select('song_id, COUNT(*) as count')
  .eq('user_id', userId)
  .group('song_id')
  .order('count', { ascending: false })
  .limit(10);

// Get similar artists
// Get recently added songs
// etc.
```

**Success Criteria:**
- ✅ Suggestions displayed (if implemented)
- ✅ Helpful and relevant

---

## 🧪 **PHASE 4: Testing & Validation**

**Duration:** 1-2 hours  
**Risk:** None  
**Files:** All

### **Test Checklist:**

#### **Queue Priority System:**
- [ ] FIFO mode works (songs play in order added)
- [ ] Round Robin mode works (fair rotation)
- [ ] Mode persists after page reload
- [ ] Mode selection UI is clear

#### **Device Queue Reordering:**
- [ ] Up/down arrows work
- [ ] Changes reflect on TV
- [ ] Cannot reorder other users' songs
- [ ] Cannot reorder playing/completed songs

#### **History & Preferences:**
- [ ] Recent 20 songs displayed
- [ ] History tab shows last 12 months
- [ ] Can add songs from history
- [ ] Preferences save and load

#### **Regression Tests:**
- [ ] Device page: Search, Queue, Add work
- [ ] TV page: Playback, Queue, Controls work
- [ ] Cross-device: Real-time sync works
- [ ] Error handling: Network errors handled

**Success Criteria:**
- ✅ All test cases pass
- ✅ No regressions
- ✅ Ready for production

---

## 📝 **PHASE 5: Documentation**

**Duration:** 30 minutes  
**Risk:** None

### **Step 5.1: Update Documentation**

1. **Update README.md:**
   - Document queue modes
   - Document history features
   - Document preferences

2. **Create PHASE3_COMPLETION_SUMMARY.md:**
   - List completed features
   - Document changes
   - Note any limitations

3. **Update ROLLBACK.md:**
   - Add Phase III rollback instructions

**Success Criteria:**
- ✅ Documentation updated
- ✅ Clear and comprehensive

---

## 🚀 **Deployment Checklist**

Before merging to main:

- [ ] All tests pass
- [ ] No TypeScript errors
- [ ] Build succeeds
- [ ] Database migrations tested
- [ ] Documentation updated
- [ ] Rollback plan verified
- [ ] Code reviewed
- [ ] Ready for production

---

## 📊 **Summary**

### **Features Added:**
1. ✅ Queue priority system (Round Robin / FIFO)
2. ✅ Device queue reordering
3. ✅ User preferences
4. ✅ Recent songs (20 most recent)
5. ✅ History tab (12 months)
6. ✅ Smart suggestions (optional)

### **Files Changed:**
- Database: `schema.sql`, new migration scripts
- API: New endpoints for reordering, preferences, history
- Frontend: Room creation UI, device queue UI, history tab
- Types: Updated TypeScript interfaces

### **Risk Assessment:**
- **Queue Priority:** Medium (touches core queue logic)
- **Reordering:** Medium (position calculations)
- **History/Preferences:** Low (mostly new features)

### **Rollback Plan:**
```bash
git checkout v2.0
# Run database rollback if needed
```

---

**Status:** ⏳ **PLANNING COMPLETE - AWAITING APPROVAL**

**Next Steps:**
1. Review this plan
2. Approve or request changes
3. Create checkpoint
4. Begin implementation following safe fix process

---

*Last Updated: 2026-01-13*  
*Plan Version: 1.0*
