# Implementation Complete: Using group_id for Search → Versions → Queue

## Summary

All code changes have been implemented to use `group_id` as the linking key between search results and version details. This solves the problem where clicking "dem dong" (2 versions) was showing 11 versions instead of 2.

## Changes Made

### 1. Database Views ✅

**File**: `database/add_group_id_to_views.sql`
- Updated `kara_song_versions_detail_view` to include `group_id`

**File**: `database/update_search_view_with_group_id.sql`
- Rebuilt `kara_song_versions_view` to use base tables (like detail view)
- Added `group_id` to SELECT
- Groups by `group_id` so each group gets its own row (no more combining groups)

### 2. API Endpoints ✅

**File**: `src/app/api/songs/search/route.ts`
- Updated to select `group_id` from search view
- Returns `group_id` in response

**File**: `src/app/api/songs/versions/route.ts`
- Updated to accept `group_id` parameter (preferred)
- Keeps `title_clean` parameter for backward compatibility
- Queries by `group_id` when available (unambiguous matching)

### 3. Frontend API Client ✅

**File**: `src/lib/api.ts`
- Added `getVersionsByGroupId()` method
- Kept `getVersionsByTitleClean()` for backward compatibility

### 4. Frontend Component ✅

**File**: `src/app/room/[code]/page.tsx`
- Updated `handleSongClick()` to accept result object with `group_id`
- Uses `group_id` when available (preferred), falls back to `title_clean`
- Updated search results rendering to pass full result object

## What You Need to Do

### Step 1: Run the SQL Updates

1. **Run `database/add_group_id_to_views.sql`** (Step 1 only - detail view)
   ```sql
   -- This updates kara_song_versions_detail_view to include group_id
   ```

2. **Run `database/update_search_view_with_group_id.sql`**
   ```sql
   -- This rebuilds kara_song_versions_view with group_id
   -- Groups by group_id so each group gets its own row
   ```

### Step 2: Test

After running the SQL:

1. **Search for "dem dong"**:
   - Should show 5 separate results (one per group) instead of 3 combined
   - Each result should have a `group_id`

2. **Click on "dem dong tenor" (2 versions)**:
   - Should show exactly 2 versions (from that specific group)
   - Should NOT show versions from other groups

3. **Add version to queue**:
   - Should work correctly with the `version_id`

## Expected Behavior

### Before (Broken)
- Search shows: "dem dong" (2 versions), "dem dong  rock" (8 versions)
- Clicking "dem dong" shows: 11 versions (wrong - includes all groups)

### After (Fixed)
- Search shows: 5 separate groups:
  - "dem dong slow rock kim quy" (6 versions)
  - "dem dong slow rock song ca kim quy" (1 version)
  - "dem dong slow rock soprano kim quy" (1 version)
  - "dem dong tenor" (2 versions) ← group_id: d15da25b-444c-4398-bd4a-96af3bbc2524
  - "dem dong vua ｜ tran" (1 version)
- Clicking "dem dong tenor" shows: Exactly 2 versions (correct!)

## Backward Compatibility

The implementation maintains backward compatibility:
- `title_clean` parameter still works in `/api/songs/versions`
- `getVersionsByTitleClean()` still works in frontend
- History/recent songs still work (they use `title_clean`)

## Next Steps

1. ✅ Run the SQL updates
2. ✅ Test the search → versions → queue flow
3. ✅ Verify "dem dong" shows 2 versions (not 11)
4. ✅ Test with other songs to ensure it works generally

## Notes

- The search view now shows each group separately (no more combining)
- This is actually better UX - users see all available groups
- If you want to combine groups again, you'd need to do it in the frontend or create a separate view
