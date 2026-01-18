# Root Cause Analysis: Search, Display, and Queue Flow

## Current Problem

**Symptom**: When clicking on a search result (e.g., "dem dong" with 2 versions), the system shows 11 versions instead of 2.

**Root Cause**: Two database views use **different title cleaning logic**, making it impossible to match search results to version details.

## Current Flow

### 1. Search (`/api/songs/search`)
- **Uses**: `kara_song_versions_view`
- **Returns**: `{ title_clean: "dem dong", version_count: 2 }`
- **Problem**: We don't know what this view does internally

### 2. Get Versions (`/api/songs/versions?title_clean=dem dong`)
- **Uses**: `kara_song_versions_detail_view`
- **Returns**: Versions with `song_title: "dem dong tenor"` or `"dem dong slow rock kim quy"`
- **Problem**: Can't match "dem dong" to "dem dong tenor" or "dem dong slow rock kim quy"

### 3. Add to Queue (`/api/queue/add`)
- **Uses**: `version_id` from step 2
- **Status**: This part works if we get the right versions

## What We Need to Investigate

### Step 1: Get the Actual View Definitions
Run this SQL to see what `kara_song_versions_view` actually does:

```sql
SELECT 
    schemaname,
    viewname,
    definition
FROM pg_views
WHERE schemaname = 'public'
  AND viewname IN ('kara_song_versions_view', 'kara_song_versions_detail_view');
```

**Why**: We need to see the exact SQL logic that cleans titles in the search view.

### Step 2: Understand the Data Model
- How does `kara_song_versions_view` group songs?
- Does it use `group_id` internally?
- What cleaning logic does it apply to `base_title_display` or `base_title_unaccent`?

### Step 3: Compare Title Cleaning
Run this to see the mismatch:

```sql
-- What search view returns
SELECT 
    'search_view' as source,
    song_title,
    version_count
FROM kara_song_versions_view
WHERE song_title ILIKE '%dem dong%'
ORDER BY song_title;

-- What detail view has
SELECT 
    'detail_view' as source,
    song_title,
    COUNT(*) as count
FROM kara_song_versions_detail_view
WHERE song_title ILIKE '%dem dong%'
GROUP BY song_title
ORDER BY song_title;
```

## Proper Solution Options

### Option A: Use `group_id` (RECOMMENDED)
**Best approach**: Add `group_id` to both views and use it as the linking key.

**Flow**:
1. Search returns: `{ title_clean: "dem dong", version_count: 2, group_id: "abc-123" }`
2. Click fetches: `/api/songs/versions?group_id=abc-123`
3. Versions query: `WHERE group_id = 'abc-123'`
4. Add to queue: Uses `version_id` from step 3

**Pros**:
- Unambiguous matching (no title cleaning issues)
- Handles edge cases (same title, different groups)
- Future-proof

**Cons**:
- Requires updating both views
- Requires API changes

### Option B: Make Both Views Use Identical Title Cleaning
**Alternative**: Ensure both views apply the exact same cleaning logic.

**Flow**:
1. Search returns: `{ title_clean: "dem dong", version_count: 2 }`
2. Click fetches: `/api/songs/versions?title_clean=dem dong`
3. Versions query: `WHERE song_title = 'dem dong'` (exact match)
4. Add to queue: Uses `version_id` from step 3

**Pros**:
- No API changes needed
- Uses existing `title_clean` parameter

**Cons**:
- Requires reverse-engineering the search view's cleaning logic
- Fragile (breaks if cleaning logic changes)
- Doesn't handle edge cases well

## Recommended Implementation Plan

### Phase 1: Investigation (Do First)
1. ✅ Run `check_view_definitions.sql` to get view definitions
2. ✅ Compare search vs detail view outputs for "dem dong"
3. ✅ Identify the exact cleaning logic used by `kara_song_versions_view`

### Phase 2: Decision
Based on investigation results:
- **If search view uses `group_id` internally**: Use Option A (add `group_id` to API)
- **If search view only cleans titles**: Use Option B (match cleaning logic)

### Phase 3: Implementation
**If Option A (group_id)**:
1. Update `kara_song_versions_view` to include `group_id` in SELECT
2. Update `kara_song_versions_detail_view` to include `group_id` in SELECT
3. Update `/api/songs/search` to return `group_id`
4. Update `/api/songs/versions` to accept `group_id` parameter
5. Update frontend to pass `group_id` instead of `title_clean`

**If Option B (matching cleaning)**:
1. Extract the exact cleaning logic from `kara_song_versions_view`
2. Apply the same logic to `kara_song_versions_detail_view.song_title`
3. Update `/api/songs/versions` to use exact match (`.eq()` instead of `.ilike()`)
4. Test with various edge cases

### Phase 4: Testing
1. Search for "dem dong" → should show 2 versions (not 11)
2. Search for "khi" → verify correct version count
3. Test edge cases: songs with same base title but different metadata
4. Verify queue addition works correctly

## Current State Checklist

- [ ] View definitions retrieved and analyzed
- [ ] Title cleaning logic understood
- [ ] Solution approach decided (A or B)
- [ ] Database views updated
- [ ] API endpoints updated
- [ ] Frontend updated (if needed)
- [ ] End-to-end testing completed

## Next Steps

1. **Run the investigation SQL** (Step 1 above)
2. **Share the view definitions** so we can analyze the cleaning logic
3. **Decide on approach** (Option A or B)
4. **Implement the fix** systematically
