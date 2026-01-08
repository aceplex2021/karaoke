# 🎤 Karaoke Web App — Targeted Refactor Plan

## Overview

This plan refactors the frontend to be passive and deterministic while keeping all working backend/DB logic intact. The goal is to eliminate state drift, race conditions, and performance issues without rebuilding from scratch.

**Timeline:** 2-3 days for Phase 1 (correctness), then incremental UX improvements.

---

## CONSTRAINTS (NON-NEGOTIABLE)

1. **Do not touch backend/DB invariants**
   - Node controller ingestion + media server
   - DB invariants + atomic playback RPCs (`start_playback`, `transition_playback`, advisory locks)
   - "Backend is playback authority" model

2. **UI is passive; all decisions server-side**
   - UI renders backend truth; UI only sends intent (add/remove/reorder/report ended/error)

3. **No any-casts; typed contracts only**
   - Eliminate `as any` in `src/app/**`, `src/lib/api.ts`
   - Supabase payloads: use `unknown` + narrowing if needed

4. **One realtime strategy per page; subscribe once/cleanup once**
   - Single subscription per channel per page
   - Proper cleanup in `useEffect` return

5. **Incremental UI polish after correctness refactor**
   - Fix correctness first, then improve UX

---

## HARD REQUIREMENTS (MUST ENFORCE)

### 1. No N+1 Media URL Resolution

**Problem:** Current code calls `resolveMediaUrl()` per queue item in a `.map()`, causing N+1 DB/network queries.

**Requirement:**
- Queue endpoints must return `song.media_url` using **one query**:
  - Option A: SQL view/RPC that joins `kara_queue → kara_songs` and outputs `media_url`
  - Option B: Single backend fetch of all needed songs, then map in-memory (one roundtrip)
- **Goal:** Queue fetch stays fast even with 100+ entries

**Implementation:**
- Create helper function `resolveMediaUrlsForQueue(queueItems: QueueItem[]): Promise<QueueItem[]>`
  - Single query to fetch all `song_id`s from queue
  - Single query to fetch all versions/files for those songs
  - In-memory mapping to attach `media_url` to each item
  - Return typed queue items with `song.media_url` populated

### 2. Realtime is Signal; HTTP Fetch is Canonical

**Problem:** Realtime subscriptions trying to "patch local state" from event payloads can miss events or drift.

**Requirement:**
- Realtime subscriptions must **not** try to patch local state from event payloads
- On any relevant realtime event (room update, queue change), trigger a **debounced refresh()**:
  - `refreshRoom()` (room + current_entry_id)
  - `refreshQueue()` (pending/playing queue)
  - **Or preferably:** One `refreshRoomState()` endpoint that returns `room + queue + current` in one call
- This prevents missed event drift

**Implementation:**
- Create `GET /api/rooms/:roomId/state` endpoint:
  ```typescript
  {
    room: Room,
    currentSong: QueueItem | null,
    queue: QueueItem[] // pending + playing only
  }
  ```
  - **Critical:** Resolves all media URLs in one batch call (no separate calls for currentSong/upNext)
  - **Critical:** Read-only endpoint with no side effects (no queue mutations/reservations)
- Frontend realtime handler:
  ```typescript
  const handleRealtimeEvent = debounce(() => {
    refreshRoomState(); // Single HTTP fetch, canonical truth
  }, 100);
  ```

### 3. Define Queue Semantics Clearly (Ledger vs Turn Order)

**Problem:** UI computing turn order locally causes confusion and drift.

**Requirement:**
- UI must **NOT** compute turn order (round-robin fairness) locally
- **Queue list = ledger order** (append order, by `position`)
- **"Up Next" = turn order**, returned from backend (either `GET /next` or included in `GET /state`)
- Show both clearly in UI so users aren't confused
- **`upNext` is informational only and must not mutate queue state.**
  - `upNext` is computed, ephemeral, and advisory only
  - It must not be "reserved" or "locked" by the frontend
  - It is a read-only indicator of who will play next via round-robin

**Implementation:**
- Backend `GET /api/rooms/:roomId/state` returns:
  ```typescript
  {
    room: Room,
    currentSong: QueueItem | null,
    queue: QueueItem[], // Ledger order (by position)
    upNext: QueueItem | null // Turn order (next to play via round-robin)
  }
  ```
- Frontend displays:
  - "Queue" section: Shows all pending items in ledger order (position 1, 2, 3...)
  - "Up Next" section: Shows `upNext` (who will play next via round-robin)
  - Clear labels: "Queue (in order added)" vs "Next to Play"

### 4. TV Page Refresh Rules

**Requirement:**
- TV subscribes to `kara_rooms` updates and triggers `refreshCurrent()` (and `refreshQueue()` if it displays "Up next")
- TV **never clears state locally**; it only reports ended/error and re-renders from backend truth
- No local "choose next" logic
- **TV page must not call add/remove/reorder APIs.**
- **TV may only call `reportEnded` / `reportError` / `skip` (if host).**
- This prevents TV from accidentally mutating queue state

**Implementation:**
- TV page realtime subscription:
  ```typescript
  useEffect(() => {
    const channel = supabase.channel(`room:${roomId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        table: 'kara_rooms',
        filter: `id=eq.${roomId}`
      }, () => {
        // Signal: trigger refresh
        debouncedRefreshCurrent();
      })
      .subscribe();
    
    return () => supabase.removeChannel(channel);
  }, [roomId]);
  ```
- `refreshCurrent()` calls `GET /api/queue/:roomId/current` (canonical truth)
- Video element reacts to `currentSong?.song?.media_url` changes
- No `setCurrentSong(null)` anywhere

### 5. Host Reorder Must Be Atomic or Disabled

**Requirement:**
- Confirm `host_reorder_queue` RPC exists in database
- If it exists: Use it (atomic server function)
- If it doesn't exist: Either implement atomic server function/RPC or **remove reorder UI for now** (keep skip/remove)
- **No half-working reorder logic in client**

**Implementation:**
- Check `database/schema.sql` for `host_reorder_queue` function
- If exists: Use it via `supabaseAdmin.rpc('host_reorder_queue', {...})`
- If not exists: Remove reorder UI buttons, keep skip/remove only
- Document decision in code comments

### 6. Type Safety Scope

**Requirement:**
- Eliminate `as any` in:
  - `src/app/**` (pages/components)
  - `src/lib/api.ts`
- Supabase payloads: Use `unknown` + narrowing if needed, but no production `any` casts

**Implementation:**
- Update `src/shared/types.ts` to include all needed types
- Type all API responses
- Type Supabase realtime payloads:
  ```typescript
  const payload = event as unknown;
  if (isRoomUpdate(payload)) {
    // typed payload
  }
  ```

---

## ACCEPTANCE CRITERIA (MUST PASS)

1. ✅ **No duplicated subscriptions**
   - Subscribe once/cleanup once per page
   - Verify in browser DevTools: only one subscription per channel

2. ✅ **Room never stays idle when pending exists**
   - `ensurePlaying()` works correctly
   - Add song to empty room → auto-starts
   - Song ends → next song auto-starts
   - Skip song → next song auto-starts

3. ✅ **Repeated calls to ended/skip are idempotent and safe**
   - Call `reportPlaybackEnded()` multiple times → no errors
   - Call `skipSong()` multiple times → no errors
   - Backend handles idempotency via DB functions

4. ✅ **Queue fetch performance: constant number of DB calls**
   - No per-item DB calls
   - Single query for all queue items + media URLs
   - Test with 100+ queue items: should be fast (< 500ms)

---

## PHASE 0: Lock Non-Negotiables (½ Day)

### Step 0.1: Document the Contract

**File:** Create `PHASE_0_CONTRACT.md` (documentation only)

- Rule: "UI renders backend truth; UI only sends intent"
- List of off-limits files:
  - `src/server/lib/queue.ts` (backend authority)
  - `database/schema.sql` (DB invariants)
  - `src/server/routes/rooms.ts` (working)
  - `src/server/routes/songs.ts` (working)
- Media URL contract definition
- Queue semantics (ledger vs turn order)

### Step 0.2: Check Host Reorder Function

**File:** `database/schema.sql`

- Search for `host_reorder_queue` function
- If exists: Document it, ensure it's atomic (uses advisory lock)
- If not exists: Document decision to remove reorder UI for now

### Step 0.3: Add `media_url` to Type System

**File:** `src/shared/types.ts`

- Add `media_url: string` to `Song` interface
- Update `QueueItem` to ensure `song.media_url` is always present
- Add helper types for queue state:
  ```typescript
  export interface RoomState {
    room: Room;
    currentSong: QueueItem | null;
    queue: QueueItem[]; // Ledger order
    upNext: QueueItem | null; // Turn order
  }
  ```

---

## PHASE 1: Make Frontend Passive and Deterministic (2-3 Days)

### Step 1.1: Standardize Media URL Contract (Backend) — NO N+1

**File:** `src/server/routes/queue.ts`

**Current Problem:**
- Media URLs computed inline with `(item as any)` casts
- Logic duplicated in 3 places (get queue, add to queue, get current)
- **N+1 problem:** Calls DB per queue item

**Solution:**

1. **Create helper function `resolveMediaUrlsForQueue(queueItems: QueueItem[]): Promise<QueueItem[]>`**
   - **All media selection logic (version preference, remix rules, fallback) must live in one place and be reused by all endpoints.**
   - Single query to get all `song_id`s from queue items
   - Single query to fetch all versions/files for those songs:
     ```sql
     SELECT 
       v.song_id,
       v.id as version_id,
       v.label,
       f.storage_path,
       f.type
     FROM kara_versions v
     JOIN kara_files f ON f.version_id = v.id
     WHERE v.song_id = ANY($1::uuid[])
     AND f.type = 'video'
     ```
   - In-memory mapping: For each queue item, find best version (prefer "nam", non-remix), attach `media_url`
   - Return typed queue items with `song.media_url` populated
   - **This helper must be the single source of truth for media URL resolution logic.**

2. **Create `GET /api/rooms/:roomId/state` endpoint** (single canonical source):
   ```typescript
   router.get('/rooms/:roomId/state', async (req, res) => {
     const { roomId } = req.params;
     
     // Fetch room
     const room = await getRoom(roomId);
     
     // Fetch current song (if any)
     const currentSong = await QueueManager.getCurrentSong(roomId);
     
     // Fetch queue (pending + playing)
     const queue = await QueueManager.getQueue(roomId);
     
     // Fetch up next (turn order)
     const upNext = await QueueManager.selectNextSong(roomId);
     
     // Resolve ALL media URLs in ONE batch call
     // Collect all queue items (queue + currentSong + upNext) into single array
     const allItems: QueueItem[] = [];
     if (currentSong) allItems.push(currentSong);
     if (upNext) allItems.push(upNext);
     allItems.push(...queue);
     
     // Single batch call to resolve all media URLs at once
     const allItemsWithUrls = await resolveMediaUrlsForQueue(allItems);
     
     // Map back to separate items
     const currentWithUrl = currentSong 
       ? allItemsWithUrls.find(item => item.id === currentSong.id) || null
       : null;
     const upNextWithUrl = upNext
       ? allItemsWithUrls.find(item => item.id === upNext.id) || null
       : null;
     const queueWithUrls = allItemsWithUrls.filter(item => 
       queue.some(q => q.id === item.id)
     );
     
     res.json({
       room,
       currentSong: currentWithUrl,
       queue: queueWithUrls,
       upNext: upNextWithUrl
     });
   });
   ```
   - **Critical:** `/rooms/:roomId/state` must resolve media_url in **one batch call** (no calling `resolveMediaUrlsForQueue()` separately for currentSong/upNext)
   - **Critical:** `/rooms/:roomId/state` is **read-only with no side effects** (no queue mutations/reservations)

3. **Update existing queue endpoints to use helper:**
   - `GET /:roomId` - Use `resolveMediaUrlsForQueue()`
   - `POST /add` - Use helper for new item
   - `GET /:roomId/current` - Use helper for current song

4. **Remove all `(item as any)` casts**
5. **Ensure `song.media_url` is always present in response**

**Result:** Backend always returns `media_url` in constant DB calls (no N+1)

---

### Step 1.2: TV Page → Pure Reactive View

**File:** `src/app/tv/page.tsx`

**Current Problems:**
- Too much local state (`currentSong`, `lastEntryIdRef`, etc.)
- Potential race conditions between realtime and local state
- Manual video element manipulation

**Solution:**

1. **Single realtime subscription pattern (signal only):**
   ```typescript
   useEffect(() => {
     const channel = supabase.channel(`room:${roomId}`, {
       config: { broadcast: { self: true } }
     })
       .on('postgres_changes', {
         event: 'UPDATE',
         schema: 'public',
         table: 'kara_rooms',
         filter: `id=eq.${roomId}`
       }, () => {
         // Signal: trigger refresh (debounced)
         debouncedRefreshRoomState();
       })
       .subscribe();
     
     return () => {
       supabase.removeChannel(channel);
     };
   }, [roomId]);
   ```
   - **Debounce timing:** 50–150ms to coalesce bursts without perceptible lag

2. **Debounced refresh function (canonical HTTP fetch):**
   ```typescript
   const refreshRoomState = async () => {
     try {
       const state = await api.getRoomState(roomId);
       setRoom(state.room);
       setCurrentSong(state.currentSong);
       setQueue(state.queue); // If displaying "Up next"
     } catch (err) {
       console.error('Failed to refresh room state:', err);
     }
   };
   
   const debouncedRefreshRoomState = useMemo(
     () => debounce(refreshRoomState, 100),
     [roomId]
   );
   ```
   - **Debounce timing guidance:** Debounce should be 50–150ms to coalesce bursts without perceptible lag.
   - Too fast (< 50ms): May cause excessive API calls
   - Too slow (> 150ms): Users may notice lag in UI updates

3. **Reactive render cycle:**
   - `room.current_entry_id` changes → realtime signal → debounced refresh → `currentSong` state updates → video element reacts
   - No local "choose next" logic
   - **No manual state clearing** (`setCurrentSong(null)` removed)

4. **Simplify state:**
   - Remove `lastEntryIdRef` (use `currentSong?.id` comparison)
   - Keep only: `room`, `currentSong`, `isPlaying`, `error`, `queue` (if displaying "Up next")

5. **Video element handling:**
   - Use `useEffect` that watches `currentSong?.song?.media_url`:
     ```typescript
     useEffect(() => {
       if (!currentSong?.song?.media_url || !videoRef.current) return;
       
       const video = videoRef.current;
       if (video.src !== currentSong.song.media_url) {
         video.src = currentSong.song.media_url;
         video.load();
         video.play().catch(err => {
           // Autoplay blocked
           setNeedsUserInteraction(true);
         });
       }
     }, [currentSong?.song?.media_url]);
     ```

6. **Event handlers (keep simple, no local state mutation):**
   - `handleEnded()` → `api.reportPlaybackEnded()` → backend handles transition → realtime signal → refresh
   - `handleError()` → `api.reportPlaybackError()` → backend handles transition → realtime signal → refresh
   - `handleSkip()` → `api.skipSong()` (only if user is host) → backend handles transition → realtime signal → refresh
   - **TV page must not call `addToQueue()`, `removeFromQueue()`, or `reorderQueue()` APIs.**

**Result:** TV page is pure renderer; backend controls what plays via canonical HTTP fetch

---

### Step 1.3: Room Page → Pure Reactive View

**File:** `src/app/room/[code]/page.tsx`

**Current Problems:**
- Local queue state that can drift
- `getUserPosition()` calculates locally
- Mixed authority (local + backend)

**Solution:**

1. **Single realtime subscription pattern (signal only):**
   ```typescript
   useEffect(() => {
     const channel = supabase.channel(`room:${roomId}`, {
       config: { broadcast: { self: true } }
     })
       .on('postgres_changes', {
         event: '*',
         schema: 'public',
         table: 'kara_queue',
         filter: `room_id=eq.${roomId}`
       }, () => {
         // Signal: trigger refresh (debounced)
         debouncedRefreshRoomState();
       })
       .on('postgres_changes', {
         event: 'UPDATE',
         schema: 'public',
         table: 'kara_rooms',
         filter: `id=eq.${roomId}`
       }, () => {
         // Signal: trigger refresh (debounced)
         debouncedRefreshRoomState();
       })
       .subscribe();
     
     return () => {
       supabase.removeChannel(channel);
     };
   }, [roomId]);
   ```

2. **Debounced refresh function (canonical HTTP fetch):**
   ```typescript
   const refreshRoomState = async () => {
     try {
       const state = await api.getRoomState(roomId);
       setRoom(state.room);
       setQueue(state.queue); // Ledger order
       setUpNext(state.upNext); // Turn order (read-only, informational)
     } catch (err) {
       console.error('Failed to refresh room state:', err);
     }
   };
   
   const debouncedRefreshRoomState = useMemo(
     () => debounce(refreshRoomState, 100),
     [roomId]
   );
   ```
   - **Debounce timing:** 50–150ms to coalesce bursts without perceptible lag
   - **`upNext` is read-only:** Display only, never mutate queue state based on it

3. **Remove local queue calculations:**
   - Delete `getUserPosition()` function
   - Delete any "turn simulation" logic
   - Display queue exactly as backend returns it

4. **Queue display (ledger vs turn order):**
   - **"Queue" section:** Shows all pending items in ledger order (by `position`: 1, 2, 3...)
   - **"Up Next" section:** Shows `upNext` (who will play next via round-robin)
   - Clear labels: "Queue (in order added)" vs "Next to Play"
   - Show "Now Playing" based on `status === 'playing'`
   - No local "who's next" calculations

**Result:** Room page displays backend truth; no local queue logic

---

### Step 1.4: Host Controls → API-Only

**File:** `src/app/room/[code]/page.tsx` (host section)

**Current Problems:**
- May have local state mutations
- May not reflect backend state correctly

**Solution:**

1. **Reorder button (if `host_reorder_queue` exists):**
   ```typescript
   const handleReorder = async (queueItemId: string, newPosition: number) => {
     try {
       await api.reorderQueue(room.id, queueItemId, newPosition);
       // UI updates automatically via realtime signal → refresh
     } catch (err) {
       // Show error, realtime will correct state
       setError(err.message);
     }
   };
   ```
   - **If `host_reorder_queue` doesn't exist:** Remove reorder UI buttons, keep skip/remove only

2. **Skip button:**
   ```typescript
   const handleSkip = async (queueItemId: string) => {
     try {
       await api.skipSong(room.id, queueItemId);
       // UI updates automatically via realtime signal → refresh
     } catch (err) {
       setError(err.message);
     }
   };
   ```

3. **Remove button:**
   ```typescript
   const handleRemove = async (queueItemId: string) => {
     try {
       await api.removeFromQueue(room.id, queueItemId);
       // UI updates automatically via realtime signal → refresh
     } catch (err) {
       setError(err.message);
     }
   };
   ```

4. **Optional optimistic UI (with rollback):**
   - Show immediate feedback
   - If API call fails, realtime refresh will correct state
   - Don't rely on optimistic updates alone

**Result:** All host actions are API calls; UI reacts to realtime signals → canonical refresh

---

### Step 1.5: Remove All `any` Casts

**Files:** All frontend files

**Solution:**

1. **Update `src/shared/types.ts`:**
   - Ensure `Song` has `media_url: string`
   - Ensure `QueueItem.song` is properly typed
   - Add `RoomState` type:
     ```typescript
     export interface RoomState {
       room: Room;
       currentSong: QueueItem | null;
       queue: QueueItem[]; // Ledger order
       upNext: QueueItem | null; // Turn order
     }
     ```

2. **Update `src/lib/api.ts`:**
   - Add `getRoomState(roomId: string): Promise<RoomState>`
   - Ensure all API responses are typed
   - No `as any` in API client

3. **Update `src/app/tv/page.tsx`:**
   - Remove `(currentSong.song as any)?.media_url`
   - Use `currentSong.song?.media_url` (typed)

4. **Update `src/app/room/[code]/page.tsx`:**
   - Remove any `as any` casts
   - Use proper types from `shared/types.ts`

5. **Type Supabase realtime payloads:**
   ```typescript
   // Helper function
   function isRoomUpdate(payload: unknown): payload is { new: Room; old: Room } {
     return (
       typeof payload === 'object' &&
       payload !== null &&
       'new' in payload &&
       'old' in payload
     );
   }
   
   // Usage
   .on('postgres_changes', {...}, (payload) => {
     if (isRoomUpdate(payload)) {
       // typed payload
       console.log(payload.new.current_entry_id);
     }
   });
   ```

**Result:** Full type safety; no `any` casts in production code

---

### Step 1.6: Verify Exit Criteria

**Testing Checklist:**

1. ✅ **No duplicated subscriptions:**
   - Open browser DevTools → Network → WS
   - Verify only one WebSocket connection per channel
   - Navigate away → subscriptions cleaned up
   - Refresh page → subscriptions recreated (not duplicated)

2. ✅ **Room never stays idle when pending exists:**
   - Add song to empty room → auto-starts (via `ensurePlaying()`)
   - Song ends → next song auto-starts
   - Skip song → next song auto-starts
   - Verify in logs: `ensurePlaying()` is called

3. ✅ **Repeated calls to ended/skip are idempotent and safe:**
   - Call `reportPlaybackEnded()` multiple times → no errors
   - Call `skipSong()` multiple times → no errors
   - Backend handles idempotency via DB functions (`transition_playback`)

4. ✅ **Queue fetch performance: constant number of DB calls:**
   - Add 100+ songs to queue
   - Fetch queue → check backend logs
   - Should see: 1 query for queue items, 1 query for all songs, 1 query for all versions/files
   - Total: 3 queries (constant), not 100+ queries
   - Response time: < 500ms

---

## PHASE 2: UX Upgrade to "YouTube-Grade" (Incremental, 1-2 Weeks)

### Step 2.1: Create Design System

**New Files:**
- `src/components/ui/Button.tsx`
- `src/components/ui/Card.tsx`
- `src/components/ui/Modal.tsx`
- `src/components/ui/Toast.tsx`
- `src/components/ui/Skeleton.tsx`
- `src/app/globals.css` - Design tokens (colors, spacing, typography)

**Approach:**
- Start with basic components
- Use consistent spacing/colors
- Make responsive (mobile + TV)
- Incrementally replace inline styles

### Step 2.2: Rebuild Key Flows

**Files to Update:**
- `src/app/page.tsx` - Join flow (room code + QR)
- `src/app/room/[code]/page.tsx` - Search/browse + add-to-queue
- `src/app/tv/page.tsx` - TV mode polish

**Approach:**
- Keep existing functionality
- Improve visual design
- Add loading states (skeletons)
- Add success/error toasts
- Make responsive

**Exit Criteria:**
- Feels consistent across screens
- Search feels instant
- Queue actions feel obvious and safe

---

## PHASE 3: Personalization (1-3 Days v1, Then Expand)

**New Files:**
- `src/server/routes/history.ts` - History endpoints
- `src/app/room/[code]/components/PersonalizedSuggestions.tsx`

**Approach:**
- Query `kara_song_history` for user/room
- Display "Continue Singing" (recently sung)
- Display "Top Songs" (frequency)
- One-tap re-add to queue
- Room-level "In this room we usually sing…"

**Critical Constraint:**
- **Personalization must not block or delay queue playback or room state refresh.**
- History queries must be:
  - Async and non-blocking
  - Cached when possible
  - Loaded after critical room state is fetched
  - Never in the critical path of queue operations

**v2 Later:**
- Similarity by artist/language/tone tags
- Collaborative filtering / embeddings

---

## PHASE 4: Observability + Hardening (1-2 Days)

**New Files:**
- `src/server/lib/logger.ts` - Structured logging
- `src/server/routes/admin.ts` - Admin diagnostics

**Approach:**
- Log every transition: why song selected, who triggered, errors
- Track playback error reasons (autoplay blocked, 404, decode error)
- Admin/host diagnostics: "room health" (playing/pending/idle + last transition)

---

## IMPLEMENTATION ORDER SUMMARY

### Week 1: Phase 0 + Phase 1 (Correctness)

**Day 1:**
- Phase 0.1: Document contract
- Phase 0.2: Check host reorder function
- Phase 0.3: Add `media_url` to types
- Step 1.1: Standardize media URL contract (NO N+1)

**Day 2:**
- Step 1.2: TV page → pure reactive view
- Step 1.3: Room page → pure reactive view (start)

**Day 3:**
- Step 1.3: Room page → pure reactive view (finish)
- Step 1.4: Host controls → API-only
- Step 1.5: Remove all `any` casts

**Day 4:**
- Step 1.6: Verify exit criteria
- Testing + bug fixes

**Day 5:**
- Buffer for issues
- Final verification

### Week 2+: Phase 2-4 (Incremental)

- Incremental UX improvements (Phase 2)
- Personalization (Phase 3)
- Observability (Phase 4)

---

## RISK MITIGATION

1. **Backend changes are isolated:**
   - Only `src/server/routes/queue.ts` changes (media URL helper, new state endpoint)
   - No changes to `QueueManager` or DB functions
   - New endpoint is additive (doesn't break existing)

2. **Frontend changes are incremental:**
   - TV page: Simplify state, keep video logic
   - Room page: Remove local logic, keep UI structure
   - Test after each step

3. **Type safety:**
   - Add types first, then remove casts
   - TypeScript will catch issues

4. **Realtime subscriptions:**
   - One subscription per page
   - Proper cleanup in `useEffect` return
   - Test subscription cleanup

5. **Performance:**
   - Test with 100+ queue items
   - Monitor DB query count
   - Use debouncing for refresh calls

---

## SUCCESS METRICS

**Phase 1 Complete When:**
- ✅ No `any` casts in frontend (`src/app/**`, `src/lib/api.ts`)
- ✅ TV page has < 10 state variables
- ✅ Room page has no local queue calculations
- ✅ All host actions are API calls
- ✅ Repeated API calls are safe (idempotent)
- ✅ Room auto-starts next song (no idle state)
- ✅ Queue fetch: constant DB calls (no N+1)
- ✅ Realtime: signal only, HTTP fetch is canonical
- ✅ Queue semantics: ledger vs turn order clearly defined

---

## FILES TO MODIFY

### Backend (Minimal Changes)
- `src/server/routes/queue.ts` - Add `resolveMediaUrlsForQueue()`, add `GET /rooms/:roomId/state`
- `src/server/routes/rooms.ts` - Add `GET /rooms/:roomId/state` endpoint (or merge into queue routes)

### Frontend (Refactor)
- `src/shared/types.ts` - Add `media_url` to `Song`, add `RoomState` type
- `src/lib/api.ts` - Add `getRoomState()`, remove `any` casts
- `src/app/tv/page.tsx` - Simplify to pure reactive view
- `src/app/room/[code]/page.tsx` - Remove local queue logic, add ledger/turn order display

### Documentation
- `PHASE_0_CONTRACT.md` - Document non-negotiables
- `Rebuild-webapp.md` - This file

---

## FILES TO KEEP UNCHANGED

- `src/server/lib/queue.ts` - Backend authority (no changes)
- `database/schema.sql` - DB invariants (no changes, unless adding `host_reorder_queue` check)
- `src/server/routes/rooms.ts` - Working (minimal changes for state endpoint)
- `src/server/routes/songs.ts` - Working (no changes)

---

**Ready to proceed when you give the green light.**
