# 🔥 REBUILD PLAN (NOT REFACTOR)

## ⚠️ CRITICAL: This is a REBUILD, not a patch

### 🎯 MUST DO's (Non-Negotiable)

1. **Delete and rebuild search, queue, playback APIs**
   - Delete ALL existing API routes
   - Build new ones from scratch following strict rules
   
2. **Queue stores version_id only**
   - Simpler data model
   - No redundant song_id storage
   
3. **UI may not infer state**
   - Zero client-side logic
   - UI = pure renderer of `/state` response
   
4. **No caching anywhere**
   - By design, not by workaround
   - Every read is fresh

---

## 📋 REBUILD TASKS

### PHASE 1: DEMOLITION 🔥

#### Task 1: Delete Old APIs
**Files to DELETE:**
```
src/app/api/queue/
├── add/route.ts                    → DELETE
├── item/[queueItemId]/
│   ├── complete/route.ts          → DELETE
│   ├── skip/route.ts              → DELETE
│   └── route.ts                   → DELETE
├── reorder/route.ts               → DELETE
├── [roomId]/
│   ├── current/route.ts           → DELETE
│   ├── playback-ended/route.ts    → DELETE
│   └── playback-error/route.ts    → DELETE

src/app/api/rooms/[roomId]/state/route.ts  → DELETE (rebuild from scratch)

src/app/api/fix-room/route.ts              → DELETE
src/app/api/check-queue/route.ts           → DELETE
src/app/api/force-fix/route.ts             → DELETE
src/app/api/nuclear-reset/route.ts         → DELETE

src/server/lib/queue.ts                     → DELETE (rebuild from scratch)
src/server/routes/                          → DELETE (old Express routes)
```

**Result:** Clean slate, zero legacy code

---

### PHASE 2: DATABASE SIMPLIFICATION 🗄️

#### Task 2: Update Schema to Store version_id Only

**Migration SQL:**
```sql
-- Add version_id column to kara_queue
ALTER TABLE kara_queue 
ADD COLUMN version_id UUID REFERENCES kara_versions(id);

-- Backfill existing data (one-time migration)
UPDATE kara_queue q
SET version_id = (
  SELECT v.id 
  FROM kara_versions v 
  WHERE v.song_id = q.song_id 
  LIMIT 1
)
WHERE version_id IS NULL;

-- Future: Can drop song_id after migration validated
-- ALTER TABLE kara_queue DROP COLUMN song_id;
```

**Schema Change:**
```typescript
// kara_queue table (simplified)
{
  id: uuid
  room_id: uuid
  user_id: uuid
  version_id: uuid  // ← ONLY this, not song_id
  status: 'pending' | 'playing' | 'completed'
  position: integer
  added_at: timestamp
  started_at: timestamp
  completed_at: timestamp
}
```

**Why:** Single source of truth for song version, simpler joins

---

### PHASE 3: REBUILD APIs FROM SCRATCH ✨

#### Task 3: Build NEW /api/rooms/[roomId]/state

**File:** `src/app/api/rooms/[roomId]/state/route.ts` (NEW)

**Implementation:**
```typescript
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/server/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: { roomId: string } }
) {
  const { roomId } = params;
  
  // 1. Get room
  const { data: room } = await supabaseAdmin
    .from('kara_rooms')
    .select('*')
    .eq('id', roomId)
    .single();
    
  if (!room) {
    return NextResponse.json({ error: 'Room not found' }, { status: 404 });
  }
  
  // 2. Get current playing song (if any)
  let currentSong = null;
  if (room.current_entry_id) {
    const { data } = await supabaseAdmin
      .from('kara_queue')
      .select(`
        *,
        kara_versions (
          id,
          media_url,
          kara_songs (*)
        ),
        kara_users (*)
      `)
      .eq('id', room.current_entry_id)
      .eq('status', 'playing')
      .single();
    currentSong = data;
  }
  
  // 3. Get pending queue
  const { data: queue } = await supabaseAdmin
    .from('kara_queue')
    .select(`
      *,
      kara_versions (
        id,
        media_url,
        kara_songs (*)
      ),
      kara_users (*)
    `)
    .eq('room_id', roomId)
    .eq('status', 'pending')
    .order('position');
  
  // 4. Get next song (for upNext display)
  const upNext = queue?.[0] || null;
  
  return NextResponse.json({
    room,
    currentSong,
    queue: queue || [],
    upNext
  }, {
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    }
  });
}
```

**Rules Enforced:**
- ✅ Pure read (zero side effects)
- ✅ No auto-start logic
- ✅ Returns ONLY what's in DB
- ✅ No caching headers

---

#### Task 4: Build NEW /api/queue/add

**File:** `src/app/api/queue/add/route.ts` (NEW)

**Implementation:**
```typescript
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/server/lib/supabase';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const { room_id, version_id, user_id } = await request.json();
  
  if (!room_id || !version_id || !user_id) {
    return NextResponse.json(
      { error: 'room_id, version_id, and user_id required' },
      { status: 400 }
    );
  }
  
  // 1. Calculate next position
  const { data: maxPos } = await supabaseAdmin
    .from('kara_queue')
    .select('position')
    .eq('room_id', room_id)
    .order('position', { ascending: false })
    .limit(1)
    .single();
  
  const position = (maxPos?.position || 0) + 1;
  
  // 2. Insert into queue
  const { data, error } = await supabaseAdmin
    .from('kara_queue')
    .insert({
      room_id,
      version_id,  // ← Store version_id ONLY
      user_id,
      position,
      status: 'pending'
    })
    .select()
    .single();
  
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  
  // 3. Return immediately (NO auto-start, NO ensurePlaying)
  return NextResponse.json({ success: true, queueItem: data });
}
```

**Rules Enforced:**
- ✅ Stores version_id only
- ✅ No auto-start logic
- ✅ Returns immediately
- ✅ Simple CRUD

---

#### Task 5: Build NEW /api/rooms/[roomId]/advance

**File:** `src/app/api/rooms/[roomId]/advance/route.ts` (NEW)

**Implementation:**
```typescript
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/server/lib/supabase';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  { params }: { params: { roomId: string } }
) {
  const { roomId } = params;
  
  // Use PostgreSQL function for atomic transition
  const { data, error } = await supabaseAdmin.rpc('advance_playback', {
    p_room_id: roomId
  });
  
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  
  if (!data) {
    return NextResponse.json({ error: 'No songs to advance' }, { status: 400 });
  }
  
  return NextResponse.json({ success: true });
}
```

**PostgreSQL Function** (create in Supabase):
```sql
CREATE OR REPLACE FUNCTION advance_playback(p_room_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_current_id UUID;
  v_next_id UUID;
BEGIN
  -- 1. Get current playing entry
  SELECT id INTO v_current_id
  FROM kara_queue
  WHERE room_id = p_room_id AND status = 'playing'
  LIMIT 1;
  
  -- 2. Mark current as completed
  IF v_current_id IS NOT NULL THEN
    UPDATE kara_queue
    SET status = 'completed', completed_at = NOW()
    WHERE id = v_current_id;
  END IF;
  
  -- 3. Get next pending song
  SELECT id INTO v_next_id
  FROM kara_queue
  WHERE room_id = p_room_id AND status = 'pending'
  ORDER BY position
  LIMIT 1;
  
  -- 4. Start next song
  IF v_next_id IS NOT NULL THEN
    UPDATE kara_queue
    SET status = 'playing', started_at = NOW()
    WHERE id = v_next_id;
    
    UPDATE kara_rooms
    SET current_entry_id = v_next_id, updated_at = NOW()
    WHERE id = p_room_id;
    
    RETURN TRUE;
  ELSE
    -- No more songs, clear room pointer
    UPDATE kara_rooms
    SET current_entry_id = NULL, updated_at = NOW()
    WHERE id = p_room_id;
    
    RETURN FALSE;
  END IF;
END;
$$ LANGUAGE plpgsql;
```

**Rules Enforced:**
- ✅ Atomic state transition
- ✅ TV-only endpoint
- ✅ Explicit state machine
- ✅ No race conditions

---

### PHASE 4: REBUILD QUEUE MANAGER 🔨

#### Task 6: Rewrite QueueManager from Scratch

**File:** `src/server/lib/queue.ts` (NEW)

**Implementation:**
```typescript
import { supabaseAdmin } from './supabase';

export class QueueManager {
  /**
   * Get current playing song for a room
   */
  static async getCurrentSong(roomId: string) {
    const { data: room } = await supabaseAdmin
      .from('kara_rooms')
      .select('current_entry_id')
      .eq('id', roomId)
      .single();
    
    if (!room?.current_entry_id) return null;
    
    const { data } = await supabaseAdmin
      .from('kara_queue')
      .select(`
        *,
        kara_versions (*, kara_songs (*)),
        kara_users (*)
      `)
      .eq('id', room.current_entry_id)
      .single();
    
    return data;
  }
  
  /**
   * Get next pending song (for upNext display)
   */
  static async getNextSong(roomId: string) {
    const { data } = await supabaseAdmin
      .from('kara_queue')
      .select(`
        *,
        kara_versions (*, kara_songs (*)),
        kara_users (*)
      `)
      .eq('room_id', roomId)
      .eq('status', 'pending')
      .order('position')
      .limit(1)
      .single();
    
    return data;
  }
}
```

**Rules Enforced:**
- ✅ Only 2 methods (read-only helpers)
- ✅ No business logic
- ✅ Simple queries
- ✅ ~50 lines total (vs 600+ before)

---

### PHASE 5: STRIP UI STATE INFERENCE 🔧

#### Task 7: Strip Device Page

**File:** `src/app/room/[code]/page.tsx`

**Changes:**
```typescript
// BEFORE (line 497):
await api.addToQueue(...);
await refreshRoomState(room.id); // ❌ DELETE THIS

// AFTER:
await api.addToQueue(...);
alert('✅ Song added!');
// Polling will pick it up within 3s
```

**Rules Enforced:**
- ✅ Zero immediate refresh
- ✅ Zero state inference
- ✅ UI waits for poll

---

#### Task 8: Strip TV Page

**File:** `src/app/tv/page.tsx`

**Changes:**
```typescript
// ADD: Video onEnded handler
const handleVideoEnd = async () => {
  if (!room?.id) return;
  await api.advancePlayback(room.id);
  // Polling will pick up new state
};

// ADD to video element:
<video
  onEnded={handleVideoEnd}
  src={currentSong?.version?.media_url}
  ...
/>

// ADD: Manual advance button
{currentSong && (
  <button onClick={handleVideoEnd}>
    ⏭️ Skip to Next
  </button>
)}
```

**Rules Enforced:**
- ✅ TV controls playback lifecycle
- ✅ Explicit advance call
- ✅ No state inference

---

### PHASE 6: ENFORCE NO CACHING 🚫

#### Task 9: Add No-Cache Headers Everywhere

**API Routes:**
```typescript
// Add to ALL API responses:
{
  headers: {
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Surrogate-Control': 'no-store'
  }
}
```

**Client-side API calls:**
```typescript
// src/lib/api.ts
fetch(url, {
  headers: {
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache'
  },
  cache: 'no-store'
})
```

**Next.js config:**
```javascript
// next.config.js
module.exports = {
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-store, must-revalidate' }
        ]
      }
    ];
  }
};
```

**Rules Enforced:**
- ✅ Zero caching at API level
- ✅ Zero caching at client level
- ✅ Zero caching at Next.js level

---

### PHASE 7: CLEANUP 🧹

#### Task 10: Delete All Temp Files

**Files to DELETE:**
```
src/app/api/fix-room/
src/app/api/check-queue/
src/app/api/force-fix/
src/app/api/nuclear-reset/
src/server/routes/          (old Express routes)
src/server/lib/media-url-resolver.ts  (if not needed)
```

---

#### Task 11: Nuclear DB Reset

**SQL:**
```sql
-- Clear all queue entries
DELETE FROM kara_queue;

-- Reset room pointers
UPDATE kara_rooms SET current_entry_id = NULL, last_singer_id = NULL;
```

---

### PHASE 8: TESTING ✅

#### Task 12: Full Flow Test

**Test Scenario:**
```
1. Device: Add song
   ✅ Returns success immediately
   ✅ Does NOT refresh state
   
2. Wait 2.5s (one poll)
   ✅ Device shows song in queue
   ✅ TV shows song in queue
   
3. TV: Click "Play Next" (if no song playing)
   ✅ Calls /advance
   ✅ Song starts playing
   
4. TV: Let video end
   ✅ Calls /advance automatically
   ✅ Next song starts
   
5. Device: Add another song during playback
   ✅ Appears in queue within 3s
   ✅ Plays after current finishes
   
6. Hit /state endpoint
   ✅ Can answer: What's playing?
   ✅ Can answer: Why? (room.current_entry_id)
   ✅ Can answer: What's next? (upNext)
```

---

## 📊 FINAL ARCHITECTURE

### 3 Endpoints:
```
GET  /api/rooms/[roomId]/state     → Pure read
POST /api/queue/add                → Write version_id
POST /api/rooms/[roomId]/advance   → TV transitions
```

### State Machine:
```
pending → playing → completed
         ↑
    /advance only
```

### Data Model:
```typescript
kara_queue {
  version_id  // ← ONLY this (not song_id)
  status      // pending | playing | completed
}
```

### UI Rules:
```
Device: Add → Alert → Wait for poll
TV:     Play → Video end → /advance → Wait for poll
Both:   Render ONLY /state response
```

---

## ✅ SUCCESS CRITERIA

- [ ] Old APIs deleted
- [ ] New APIs built from scratch
- [ ] Queue stores version_id only
- [ ] Zero state inference in UI
- [ ] Zero caching anywhere
- [ ] Full flow works end-to-end
- [ ] Can debug via /state

---

## 🚀 EXECUTION ORDER

1. Delete old code (clean slate)
2. Update schema (version_id only)
3. Build 3 new APIs
4. Strip UI inference
5. Enforce no-cache
6. Test end-to-end

**Estimated Time:** 90 minutes

**Ready to execute? Reply "START REBUILD"**
