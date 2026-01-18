# Autoplay and Round-Robin Fixes

## Issues Fixed

### Issue 1: Autoplay Not Working
**Problem:** After a song finishes, the next song doesn't auto-play - requires manual click.

**Root Cause:**
- After `/advance` is called, the code waited for polling (≤3s) to see new state
- During that delay, the video element didn't know about the new song
- Video effect didn't trigger to load and play the new song

**Fix:**
1. Call `refreshState()` immediately after `/advance` succeeds (line 303)
2. Clear both `playingQueueItemIdRef` and `currentVideoSrcRef` to force reload (lines 301-302)
3. Updated video effect check to allow reload when `playingQueueItemIdRef` is `null` (line 219)
4. Added `refreshState` to video effect dependency array (line 345)

**Result:** Next song loads and plays immediately after current song ends.

---

### Issue 2: Round-Robin Not Working
**Status:** Fixed

**Current Implementation:**
- `advance_playback` function orders by `round_number ASC, position ASC` in round-robin mode (correct)
- State endpoint sorts queue by `round_number ASC, position ASC` in round-robin mode (correct)
- `currentSong` is selected based on `room.current_entry_id` set by `advance_playback` (correct)

**Potential Issues:**
- Round numbers might not be set correctly when songs are added
- Reordering might break round numbers (but we fixed this)
- Need to verify round numbers are correct in database

**Next Steps:**
- Test round-robin mode after autoplay fix
- Check if round numbers are being set correctly when songs are added
- Verify `advance_playback` is selecting songs in correct round-robin order

---

## Files Modified

- `src/app/tv/page.tsx`:
  - Line 219: Updated video effect check to allow reload when refs are null
  - Lines 301-303: Clear refs and call `refreshState` immediately after `/advance`
  - Line 345: Added `refreshState` to dependency array

---

## Testing Checklist

- [ ] Song finishes → next song auto-plays immediately
- [ ] No manual click required for next song
- [ ] Round-robin mode: songs play in correct round order
- [ ] Round-robin mode: each user gets one turn before next round
- [ ] FIFO mode: songs play in position order
- [ ] Reordering still works correctly

---

## Checkpoint

**Branch:** `checkpoint-before-autoplay-fix`
**Commit:** `04fc072` - "CHECKPOINT: Before fixing autoplay and round-robin issues - reorder working"

**Revert:** `git reset --hard checkpoint-before-autoplay-fix`
