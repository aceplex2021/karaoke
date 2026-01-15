# Reorder Logic Analysis - All Issues Found

## Overview
Comprehensive review of reorder logic across codebase. Found **7 critical issues** affecting queue management, playback, and round-robin mode.

---

## Issue 1: TV Page Video Player - Wrong Song Tracking
**Location:** `src/app/tv/page.tsx` lines 202-345

**Problem:**
- Video effect depends only on `currentSong?.song?.media_url` (line 345), not `currentSong?.id`
- `onEnded` handler doesn't verify which queue item actually ended
- No tracking of which queue item ID is actually playing in video element

**Impact:**
- When `currentSong.id` changes (A1 → A2), video element may still be playing A1
- When A1's video ends, `onEnded` fires → calls `/advance` → marks A2 as completed even though A2 never played
- Next song (A1) gets skipped because DB thinks A2 was playing

**Root Cause:**
Video element state is not synchronized with DB `currentSong.id`. Only `media_url` is tracked.

---

## Issue 2: TV Page Reorder Endpoint Missing
**Location:** `src/app/tv/page.tsx` lines 735, 769

**Problem:**
- TV page calls `api.reorderQueue(item.id, newPos, room.id)` (lines 735, 769)
- `api.reorderQueue` calls `/api/queue/reorder` endpoint (see `src/lib/api.ts` line 254)
- **This endpoint does not exist** - no file at `src/app/api/queue/reorder/route.ts`

**Impact:**
- TV host reorder buttons will always fail
- Silent failures or 404 errors

**Root Cause:**
Endpoint was planned but never implemented. TV page references non-existent API.

---

## Issue 3: State Endpoint Ignores Round-Robin Mode
**Location:** `src/app/api/rooms/[roomId]/state/route.ts` line 122

**Problem:**
- Queue query orders by `position ASC` only (line 122)
- Does NOT consider `round_number` for round-robin mode
- `advance_playback` orders by `round_number ASC, position ASC` in round-robin mode (see `database/create_advance_playback_function.sql` line 39)

**Impact:**
- TV queue display order doesn't match what `advance_playback` will actually select
- Users see wrong order on TV vs. what actually plays
- Round-robin fairness is broken in display

**Example:**
- Round 1: A1 (pos 1), B1 (pos 2)
- Round 2: A2 (pos 3), B2 (pos 4)
- State endpoint shows: A1, B1, A2, B2 (correct)
- But if A reorders: A2, A1 → positions become: A2 (pos 1), B1 (pos 2), A1 (pos 3), B2 (pos 4)
- State endpoint shows: A2, B1, A1, B2 (wrong - A2 should be in round 2, not round 1)
- `advance_playback` will select by round_number first, so order is correct in DB but wrong in UI

**Root Cause:**
State endpoint doesn't respect `queue_mode` when ordering queue.

---

## Issue 4: User Reorder Breaks Round-Robin Ordering
**Location:** `database/user_reorder_queue.sql` lines 90-101

**Problem:**
- `user_reorder_queue` swaps `position` but NOT `round_number` (line 92 comment confirms this)
- In round-robin mode, `advance_playback` orders by `round_number ASC, position ASC` (line 39 of `create_advance_playback_function.sql`)
- After reorder, positions change but `round_number` stays the same
- This breaks round-robin ordering

**Example:**
- Original: A1 (round 1, pos 1), B1 (round 1, pos 2), A2 (round 2, pos 3)
- A reorders A2 up: A2 (round 2, pos 1), B1 (round 1, pos 2), A1 (round 1, pos 3)
- `advance_playback` will select: A2 first (round 2, pos 1) - **WRONG!** Should be A1 (round 1, pos 1)

**Impact:**
- Round-robin fairness is broken after any user reorder
- Users can jump ahead in rounds by reordering

**Root Cause:**
`round_number` represents global round order and should not change, but reordering positions within a user's songs can move songs across rounds incorrectly.

---

## Issue 5: Host Reorder Doesn't Consider Round-Robin
**Location:** `database/add_host_reorder_queue.sql` lines 53-76

**Problem:**
- `host_reorder_queue` shifts positions but doesn't update `round_number`
- In round-robin mode, this breaks the round ordering
- Same issue as Issue 4, but for host reordering

**Impact:**
- Host reordering breaks round-robin fairness
- Songs can move between rounds incorrectly

**Root Cause:**
Host reorder function doesn't account for `round_number` in round-robin mode.

---

## Issue 6: Video Effect Dependency Array Missing Queue Item ID
**Location:** `src/app/tv/page.tsx` line 345

**Problem:**
- Effect dependency: `[currentSong?.song?.media_url, room, volume]`
- Missing `currentSong?.id` in dependency array
- If `currentSong.id` changes but `media_url` is same (unlikely but possible), effect won't run
- More importantly: effect doesn't track which queue item is actually loaded in video element

**Impact:**
- Video element may not reload when `currentSong.id` changes
- State mismatch between DB and video element

**Root Cause:**
Dependency array doesn't include queue item ID.

---

## Issue 7: onEnded Doesn't Verify Playing Song
**Location:** `src/app/tv/page.tsx` lines 266-287

**Problem:**
- `handleEnded` calls `/advance` without verifying which song actually ended
- No check that the ended video matches `currentSong.id` from DB
- If video element is playing A1 but DB thinks A2 is playing, A1 ending will mark A2 as completed

**Impact:**
- Wrong songs get marked as completed
- Queue gets out of sync

**Root Cause:**
No validation that the ended video matches the DB's current song.

---

## Summary of Issues by Component

### TV Page (`src/app/tv/page.tsx`)
- ❌ Issue 1: Video player doesn't track queue item ID
- ❌ Issue 2: Calls non-existent reorder endpoint
- ❌ Issue 6: Video effect missing queue item ID dependency
- ❌ Issue 7: onEnded doesn't verify playing song

### State Endpoint (`src/app/api/rooms/[roomId]/state/route.ts`)
- ❌ Issue 3: Ignores round-robin mode when ordering queue

### User Reorder Function (`database/user_reorder_queue.sql`)
- ❌ Issue 4: Breaks round-robin ordering by not handling round_number

### Host Reorder Function (`database/add_host_reorder_queue.sql`)
- ❌ Issue 5: Doesn't consider round-robin mode

### Missing Endpoint
- ❌ Issue 2: `/api/queue/reorder` doesn't exist

---

## Recommended Fix Priority

1. **Critical (Blocks Playback):**
   - Issue 1: TV video player tracking
   - Issue 7: onEnded verification

2. **High (Breaks Round-Robin):**
   - Issue 3: State endpoint round-robin ordering
   - Issue 4: User reorder round-robin handling
   - Issue 5: Host reorder round-robin handling

3. **Medium (Missing Feature):**
   - Issue 2: TV reorder endpoint

4. **Low (Edge Case):**
   - Issue 6: Video effect dependency

---

## Next Steps

1. Fix TV video player to track queue item ID
2. Add verification in onEnded handler
3. Fix state endpoint to respect queue_mode
4. Fix reorder functions to handle round_number correctly
5. Implement missing TV reorder endpoint (or remove UI)
