# Critical Fixes Needed

## ✅ Issue 1: Search Not Working (FIXED)
**Problem:** Search was querying `title_display` (with accents) instead of `normalized_title` (without accents)

**Fixed in:**
- `src/app/api/songs/search/route.ts`
- `src/app/api/songs/search-versions/route.ts`

**Solution:** Now normalizes search query and searches on `normalized_title` column

**Test:**
- Search for "chon phon hoa" → should find "Chốn Phồn Hoa"
- Search for "gia tu" → should find "Giã Từ"

---

## ⚠️ Issue 2: Supabase Schema Cache Out of Date (NEEDS FIXING)
**Problem:** `kara_queue` table's foreign key to `kara_versions` wasn't updated after migration

**Error in logs:**
```
Could not find a relationship between 'kara_queue' and 'kara_versions'
```

**Fix Required:**
1. Run `database/migrations/FIX_QUEUE_FOREIGN_KEY.sql` in Supabase SQL Editor
2. This will:
   - Drop old foreign key constraint
   - Add new constraint pointing to new `kara_versions` table
   - Reload Supabase schema cache

**Steps:**
1. Open Supabase Dashboard → SQL Editor
2. Copy contents of `FIX_QUEUE_FOREIGN_KEY.sql`
3. Run it
4. Restart your dev server (`npm run dev`)

---

## ⚠️ Issue 2B: advance_playback Function Still Uses song_id (NEEDS FIXING)
**Problem:** PostgreSQL function `advance_playback` references old `song_id` column

**Error in logs:**
```
Error: column "song_id" does not exist
```

**Fix Required:**
1. Run `database/migrations/FIX_ADVANCE_PLAYBACK_FUNCTION.sql` in Supabase SQL Editor
2. This will:
   - Update the function to use `version_id` instead of `song_id`
   - Fix history writing to use `version_id`
   - Remove all references to the old `song_id` column

**Steps:**
1. Open Supabase Dashboard → SQL Editor
2. Copy contents of `FIX_ADVANCE_PLAYBACK_FUNCTION.sql`
3. Run it
4. Test skip/advance functionality

---

## ⚠️ Issue 3: Preview Not Working (DIAGNOSIS NEEDED)
**Possible causes:**

### A. Media Server URL
Your `.env-production` has:
```
MEDIA_SERVER_URL=https://8a8243fc4533.ngrok-free.app
```

**Questions:**
1. Is this ngrok tunnel still active?
2. Does it allow CORS requests from localhost:3000?
3. Can you access files directly via browser?

**Test URL:**
Try opening a file URL in browser (check Network tab in DevTools):
```
https://8a8243fc4533.ngrok-free.app/Videos/[some-file].mp4
```

### B. Storage Path Format
Check if files in database have correct paths:
```sql
-- Run in Supabase SQL Editor
SELECT storage_path FROM kara_files LIMIT 5;
```

Expected format: `/Videos/filename.mp4` or `Videos/filename.mp4`

### C. CORS Configuration
Ngrok might block requests from localhost. You may need to:
1. Add ngrok CORS headers
2. Or use local media server for dev (http://10.0.19.10:8090)

**Quick test:**
Update your local `.env` file:
```
MEDIA_SERVER_URL=http://10.0.19.10:8090
```

Then restart dev server and try preview again.

---

## Feature Verification Summary

**✅ WORKING (No fixes needed):**
- Host queue reorder (TV page)
- User queue reorder (device page)
- Queue item delete/remove
- Favorites (add/view/remove)

**⚠️ BROKEN (Needs DB fixes):**
- Skip/advance to next song (uses old `song_id`)
- History tabs (expects `version_id` but DB has `song_id`)

---

## Next Steps

**Run these SQL fixes in Supabase SQL Editor (in order):**

1. **Fix foreign key** - Run `FIX_QUEUE_FOREIGN_KEY.sql`
2. **Fix history table** - Run `FIX_HISTORY_TABLE.sql` 
3. **Fix advance function** - Run `FIX_ADVANCE_PLAYBACK_FUNCTION.sql`
4. **Restart dev server** - `npm run dev`
5. **Test functionality:**
   - ✅ Search (should work now - English & Vietnamese keyboards)
   - ✅ Preview (should work now - fixed URL encoding)
   - ✅ Add to queue (should work)
   - ✅ Queue reorder/remove (already working)
   - ✅ Favorites (already working)
   - ⚠️ Skip/advance to next song (needs fix #3)
   - ⚠️ History tabs (needs fix #2)

**See `FEATURE_VERIFICATION.md` for detailed analysis.**

---

## Quick Commands

```bash
# Restart dev server
npm run dev

# Check DB migration progress
# (Run in Supabase SQL Editor)
SELECT COUNT(*) as total_versions FROM kara_versions;
SELECT COUNT(*) as total_files FROM kara_files;
```
