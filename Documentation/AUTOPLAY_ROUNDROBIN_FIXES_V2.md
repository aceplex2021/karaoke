# Autoplay and Round-Robin Fixes V2

## Issues Fixed

### Issue 1: Autoplay Not Working
**Problem:** After a song finishes, the next song doesn't auto-play - requires manual click.

**Root Cause:**
- Video element might not be ready when `refreshState` updates `currentSong`
- `handleLoadedData` event might not fire reliably
- Video element remounting (due to key change) might reset state

**Fixes Applied:**
1. Added `setTimeout` in `handleLoadedData` to ensure video is fully ready before calling `play()` (line 236)
2. Updated video element key to include both `currentSong.id` and `media_url` for proper remounting (line 425)
3. Immediate `refreshState` call after `/advance` to get new song (line 307)
4. Clear refs to force reload (lines 302-303)

**Files Modified:**
- `src/app/tv/page.tsx`: Lines 236, 302-308, 425

---

### Issue 2: Round-Robin Logic Wrong
**Problem:** Round-robin was using timestamp + max round_number, not strictly user order.

**Expected Behavior:**
- User A has 4 songs, User B has 2 songs
- Order should be: A1, B1, A2, B2, A3, A4
- Each user gets ONE song per round maximum

**Root Cause:**
- Old logic: Checked if user has song in "current round" (max round_number)
- This allowed users to skip ahead if they added songs later

**Fixes Applied:**
1. **PostgreSQL Function** (`database/fix_round_robin_logic.sql`):
   - Find first round (starting from 1) where user doesn't have a song
   - Ensures proper round-robin: Round 1 = first song from each user, Round 2 = second song, etc.

2. **API Endpoint** (`src/app/api/queue/add/route.ts`):
   - Updated round_number calculation to loop through rounds 1 to maxRound+1
   - Finds first round where user has 0 songs
   - Ensures strict user order

**Files Modified:**
- `database/fix_round_robin_logic.sql`: Complete rewrite
- `src/app/api/queue/add/route.ts`: Lines 74-101

---

## Testing Checklist

### Autoplay
- [ ] Song finishes → next song auto-plays immediately
- [ ] No manual click required
- [ ] Works after reordering
- [ ] Works in both FIFO and round-robin modes

### Round-Robin
- [ ] User A adds 4 songs, User B adds 2 songs
- [ ] Order is: A1, B1, A2, B2, A3, A4 (by round_number)
- [ ] Each user gets one song per round
- [ ] Songs play in correct round-robin order
- [ ] Reordering maintains round-robin fairness

---

## Database Migration Required

**Run this SQL file:**
```sql
-- database/fix_round_robin_logic.sql
```

This updates the `calculate_round_robin_position` function to use correct round-robin logic.

---

## Checkpoint

**Branch:** `checkpoint-before-autoplay-fix`
**Commit:** `04fc072`

**Revert:** `git reset --hard checkpoint-before-autoplay-fix`
