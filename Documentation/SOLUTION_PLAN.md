# Solution Plan: Fix Search → Versions → Queue Flow

## Problem Summary

**Current Issue**: Clicking a search result (e.g., "dem dong" with 2 versions) shows 11 versions instead of 2.

**Root Cause**: `kara_song_versions_view` (search) and `kara_song_versions_detail_view` (versions) use different title cleaning logic, so we can't match them.

## Current Flow (Broken)

```
1. User searches "dem dong"
   → /api/songs/search
   → Queries kara_song_versions_view
   → Returns: { title_clean: "dem dong", version_count: 2 }

2. User clicks "dem dong (2 versions)"
   → /api/songs/versions?title_clean=dem dong
   → Queries kara_song_versions_detail_view WHERE song_title = 'dem dong'
   → ❌ No match! Detail view has "dem dong tenor", "dem dong slow rock kim quy", etc.
   → Returns: 0 versions OR wrong versions (if using ILIKE)

3. User selects version
   → /api/queue/add { version_id: "..." }
   → ✅ This part works (if we get the right version_id)
```

## Investigation Steps (Do First)

### Step 1: Get View Definitions
Run `database/investigate_view_mismatch.sql` to:
- See the exact SQL definition of both views
- Compare their outputs for "dem dong"
- Check if `group_id` is available in either view
- Understand the source data structure

### Step 2: Analyze the Mismatch
From the investigation results, determine:
- What cleaning logic does `kara_song_versions_view` use?
- What cleaning logic does `kara_song_versions_detail_view` use?
- Can we add `group_id` to both views?

## Solution Options

### Option A: Use `group_id` (RECOMMENDED)

**Why**: Unambiguous, handles edge cases, future-proof.

**Changes Required**:

1. **Update `kara_song_versions_view`**:
   ```sql
   -- Add group_id to SELECT
   SELECT
     group_id,  -- ← ADD THIS
     song_title,
     version_count
   FROM ...
   ```

2. **Update `kara_song_versions_detail_view`**:
   ```sql
   -- Add group_id to SELECT
   SELECT
     group_id,  -- ← ADD THIS
     id,
     version_id,
     song_title,
     ...
   FROM ...
   ```

3. **Update `/api/songs/search`**:
   ```typescript
   // Return group_id in response
   const formattedResults = results.map((r: any) => ({
     title_clean: r.song_title,
     version_count: r.version_count,
     group_id: r.group_id,  // ← ADD THIS
   }));
   ```

4. **Update `/api/songs/versions`**:
   ```typescript
   // Accept group_id parameter
   const groupId = searchParams.get('group_id');
   
   // Query by group_id instead of title_clean
   const { data: versions } = await supabaseAdmin
     .from('kara_song_versions_detail_view')
     .select('...')
     .eq('group_id', groupId);  // ← Use group_id
   ```

5. **Update Frontend (`src/app/room/[code]/page.tsx`)**:
   ```typescript
   // Pass group_id instead of title_clean
   const handleSongClick = async (result: SearchResult) => {
     const response = await api.getVersionsByGroupId(result.group_id);
     // ...
   };
   ```

**Pros**:
- ✅ Unambiguous matching (no title parsing issues)
- ✅ Handles edge cases (same title, different groups)
- ✅ Future-proof
- ✅ Cleaner code

**Cons**:
- ⚠️ Requires updating both views
- ⚠️ Requires API changes
- ⚠️ Requires frontend changes

### Option B: Match Title Cleaning Logic

**Why**: Minimal changes, uses existing `title_clean` parameter.

**Changes Required**:

1. **Extract cleaning logic from `kara_song_versions_view`**:
   - Run investigation SQL to see the exact logic
   - Copy it to `kara_song_versions_detail_view`

2. **Update `kara_song_versions_detail_view`**:
   ```sql
   -- Apply the SAME cleaning logic as search view
   -- (exact logic depends on investigation results)
   LOWER(
     TRIM(
       REGEXP_REPLACE(
         COALESCE(g.base_title_display, g.base_title_unaccent),
         -- Use the EXACT same pattern as kara_song_versions_view
         '...'
       )
     )
   ) AS song_title,
   ```

3. **Update `/api/songs/versions`**:
   ```typescript
   // Use exact match (not ILIKE with wildcards)
   const { data: versions } = await supabaseAdmin
     .from('kara_song_versions_detail_view')
     .select('...')
     .eq('song_title', titleClean);  // ← Exact match
   ```

**Pros**:
- ✅ No API signature changes
- ✅ No frontend changes
- ✅ Uses existing `title_clean` parameter

**Cons**:
- ⚠️ Requires reverse-engineering the search view
- ⚠️ Fragile (breaks if cleaning logic changes)
- ⚠️ Doesn't handle edge cases well (same cleaned title, different groups)

## Recommended Approach

**Use Option A (group_id)** because:
1. It's the most robust solution
2. It handles edge cases properly
3. It's easier to maintain long-term
4. The changes are straightforward

## Implementation Checklist

### Phase 1: Investigation
- [ ] Run `database/investigate_view_mismatch.sql`
- [ ] Analyze view definitions
- [ ] Compare outputs for "dem dong"
- [ ] Check if `group_id` is available
- [ ] Document findings

### Phase 2: Decision
- [ ] Choose Option A or B based on investigation
- [ ] Document decision and rationale

### Phase 3: Implementation (Option A)
- [ ] Update `kara_song_versions_view` to include `group_id`
- [ ] Update `kara_song_versions_detail_view` to include `group_id`
- [ ] Update `/api/songs/search` to return `group_id`
- [ ] Update `/api/songs/versions` to accept `group_id`
- [ ] Update frontend to use `group_id`
- [ ] Update TypeScript types

### Phase 3: Implementation (Option B)
- [ ] Extract cleaning logic from `kara_song_versions_view`
- [ ] Apply same logic to `kara_song_versions_detail_view`
- [ ] Update `/api/songs/versions` to use exact match
- [ ] Test with various edge cases

### Phase 4: Testing
- [ ] Search for "dem dong" → should show 2 versions (not 11)
- [ ] Search for "khi" → verify correct version count
- [ ] Test edge cases (same title, different groups)
- [ ] Verify queue addition works
- [ ] Test with various search terms

## Next Steps

1. **Run the investigation SQL** (`database/investigate_view_mismatch.sql`)
2. **Share the results** so we can analyze and decide on the approach
3. **Implement the chosen solution** systematically
4. **Test thoroughly** before considering it done
