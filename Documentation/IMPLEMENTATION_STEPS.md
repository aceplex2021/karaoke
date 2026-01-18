# Implementation Steps: Use group_id for Search → Versions → Queue

## Overview

Based on the investigation, we have 5 distinct groups for "dem dong":
1. "dem dong tenor" (2 versions) - group_id: `d15da25b-444c-4398-bd4a-96af3bbc2524`
2. "dem dong slow rock kim quy" (6 versions)
3. "dem dong slow rock song ca kim quy" (1 version)
4. "dem dong slow rock soprano kim quy" (1 version)
5. "dem dong vua ｜ tran" (1 version)

The search view groups some of these (e.g., the 3 "slow rock" groups into "dem dong  rock" with 8 versions).

## Step-by-Step Implementation

### Step 1: Get Search View Definition
Run `database/get_search_view_definition.sql` to see how `kara_song_versions_view` is defined.

**Why**: We need to see if it groups by `group_id` or by cleaned `song_title`. This determines how we add `group_id` to it.

### Step 2: Update Detail View (Already Done)
The file `database/add_group_id_to_views.sql` already includes the update for `kara_song_versions_detail_view`.

**Run this SQL**:
```sql
-- From database/add_group_id_to_views.sql, Step 1
DROP VIEW IF EXISTS kara_song_versions_detail_view;

CREATE OR REPLACE VIEW kara_song_versions_detail_view AS
SELECT
  f.id,
  f.version_id,
  g.id AS group_id,  -- ← ADDED
  LOWER(COALESCE(g.base_title_display, g.base_title_unaccent)) AS song_title,
  -- ... rest of the view
```

### Step 3: Update Search View
Once you have the search view definition, we need to modify it to include `group_id`.

**If the view groups by `song_title` only**:
- We need to add `group_id` to the SELECT and GROUP BY
- But this might break the grouping (e.g., "dem dong  rock" combines 3 groups)
- **Solution**: Return the first `group_id` for each grouped result, OR return all `group_id`s as an array

**If the view already groups by `group_id`**:
- Just add `group_id` to the SELECT clause

**After updating, verify**:
```sql
SELECT group_id, song_title, version_count
FROM kara_song_versions_view
WHERE song_title ILIKE '%dem dong%'
ORDER BY song_title;
```

### Step 4: Update API Endpoints

#### 4a. Update `/api/songs/search` to return `group_id`
File: `src/app/api/songs/search/route.ts`

Change:
```typescript
.select('song_title, version_count')
```

To:
```typescript
.select('group_id, song_title, version_count')
```

And update the response:
```typescript
const formattedResults = (results || []).map((r: any) => ({
  title_clean: r.song_title,
  version_count: r.version_count,
  group_id: r.group_id,  // ← ADD THIS
}));
```

#### 4b. Update `/api/songs/versions` to accept `group_id`
File: `src/app/api/songs/versions/route.ts`

Change from:
```typescript
const titleClean = searchParams.get('title_clean');
// Query by title_clean
```

To:
```typescript
const groupId = searchParams.get('group_id');
const titleClean = searchParams.get('title_clean'); // Keep for backward compatibility

// Query by group_id (preferred) or title_clean (fallback)
if (groupId) {
  const { data: versions } = await supabaseAdmin
    .from('kara_song_versions_detail_view')
    .select('id, version_id, group_id, song_title, tone, mixer, style, artist, storage_path')
    .eq('group_id', groupId)  // ← Use group_id
    .order('tone', { ascending: true, nullsFirst: false })
    // ...
} else if (titleClean) {
  // Fallback to title_clean for backward compatibility
  // ...
}
```

### Step 5: Update Frontend API Client
File: `src/lib/api.ts`

Add new method:
```typescript
async getVersionsByGroupId(groupId: string): Promise<{
  group_id: string;
  versions: Array<{...}>;
}> {
  const url = `${API_BASE}/songs/versions?group_id=${encodeURIComponent(groupId)}`;
  const res = await fetch(url);
  // ...
}
```

### Step 6: Update Frontend Component
File: `src/app/room/[code]/page.tsx`

Change `handleSongClick` to use `group_id`:
```typescript
const handleSongClick = async (result: SearchResult) => {
  if (result.group_id) {
    // Use group_id (new way)
    const response = await api.getVersionsByGroupId(result.group_id);
    // ...
  } else {
    // Fallback to title_clean (backward compatibility)
    const response = await api.getVersionsByTitleClean(result.title_clean);
    // ...
  }
};
```

### Step 7: Update TypeScript Types
File: `src/shared/types.ts` or wherever search result types are defined

Add `group_id` to search result type:
```typescript
interface SearchResult {
  title_clean: string;
  version_count: number;
  group_id?: string;  // ← ADD THIS (optional for backward compatibility)
}
```

## Testing Checklist

After implementation:

1. **Search for "dem dong"**:
   - Should show 3 results: "dem dong" (2), "dem dong  nam vua..." (1), "dem dong  rock" (8)
   - Each result should have a `group_id`

2. **Click on "dem dong" (2 versions)**:
   - Should show exactly 2 versions (from group "dem dong tenor")
   - Should NOT show versions from other groups

3. **Click on "dem dong  rock" (8 versions)**:
   - Should show 8 versions (from the 3 "slow rock" groups)
   - This might require special handling if the search view groups them

4. **Add version to queue**:
   - Should work correctly with the `version_id`

## Handling Multi-Group Results

**Issue**: If the search view groups multiple groups (like "dem dong  rock" = 3 groups), we need to handle this.

**Option A**: Return the first `group_id` and show only that group's versions
- Simple but might not show all 8 versions

**Option B**: Return all `group_id`s as an array and query all of them
- More complex but shows all versions

**Option C**: Don't group in the search view - show each group separately
- Simplest but changes search behavior

**Recommendation**: Start with Option A, then enhance to Option B if needed.

## Next Steps

1. **Run `database/get_search_view_definition.sql`** and share the result
2. **Run `database/add_group_id_to_views.sql`** (Step 1 - detail view)
3. **Update search view** based on its definition
4. **Update APIs** (Steps 4a-4b)
5. **Update frontend** (Steps 5-6)
6. **Test thoroughly**
