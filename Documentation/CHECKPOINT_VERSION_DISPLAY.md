# Checkpoint: Version Display Issue (To Fix Later)

## Status: ✅ Search → Versions → Queue Flow FIXED

The core issue of clicking a search result and getting wrong versions has been **FIXED** using `group_id` as the linking key.

### What Was Fixed

1. **Database Views**:
   - ✅ `kara_song_versions_detail_view` now includes `group_id`
   - ✅ `kara_song_versions_view` rebuilt to include `group_id` and group by `group_id`

2. **API Endpoints**:
   - ✅ `/api/songs/search` returns `group_id` in results
   - ✅ `/api/songs/versions` accepts `group_id` parameter (preferred) or `title_clean` (fallback)

3. **Frontend**:
   - ✅ `handleSongClick` updated to use `group_id` when available
   - ✅ API client has `getVersionsByGroupId()` method
   - ✅ Search results pass full result object with `group_id`

### Current Behavior

- ✅ Clicking a search result now fetches versions using `group_id` (unambiguous)
- ✅ Shows correct number of versions for the selected group
- ✅ Adding to queue works correctly with `version_id`

## Status: ⚠️ Version Display Still Messy

The version display in the modal/selector is still showing messy formatting. This is a **separate issue** from the core search/versions/queue flow.

### What's Broken

- Version display format in the selector modal needs cleanup
- Title formatting, metadata display, etc.

### Files Related to Version Display

- `src/app/room/[code]/page.tsx` - Version selector modal rendering
- `src/app/api/songs/versions/route.ts` - Version data structure
- `src/lib/api.ts` - Version response types

## Next Steps (For Later)

When ready to fix version display:

1. Review the version selector modal code in `src/app/room/[code]/page.tsx`
2. Check how versions are formatted/displayed
3. Clean up the display format (title capitalization, metadata formatting, etc.)
4. Test with various songs to ensure consistent formatting

## SQL Files Run

1. ✅ `database/add_group_id_to_views.sql` (Step 1 - detail view)
2. ✅ `database/update_search_view_with_group_id.sql` (search view)

## Code Changes Made

### Database
- `database/add_group_id_to_views.sql` - Adds `group_id` to detail view
- `database/update_search_view_with_group_id.sql` - Rebuilds search view with `group_id`

### API
- `src/app/api/songs/search/route.ts` - Returns `group_id`
- `src/app/api/songs/versions/route.ts` - Accepts `group_id` parameter

### Frontend
- `src/lib/api.ts` - Added `getVersionsByGroupId()` method
- `src/app/room/[code]/page.tsx` - Updated `handleSongClick` to use `group_id`

## Test Results

✅ Search for "khi" → Shows results with `group_id`
✅ Click on result → Fetches versions using `group_id`
✅ Versions returned correctly for the selected group
⚠️ Version display formatting needs cleanup (separate issue)
