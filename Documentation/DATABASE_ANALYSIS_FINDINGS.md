# Database Analysis Findings

**Date**: 2026-01-17  
**Database**: Karaoke Application Production

## Executive Summary

Analyzed 16 tables with **~21,000 total records** and **5 views**. The database is mostly healthy but has some issues requiring attention:

### Critical Issues
1. **2,373 files (20%)** have unrecognized path separators (marked as "Other")
2. **67 songs (0.7%)** not in any group (orphaned)
3. **20+ duplicate songs** with identical title+artist

### Good News
- ✅ No orphaned files, versions, queue items, or history items
- ✅ No paths with backslashes, leading/trailing spaces, or multiple slashes
- ✅ All 11,727 storage paths are unique (no duplicates)
- ✅ Strong referential integrity with proper foreign keys

---

## Table Summary

| Table | Rows | Size | Purpose | Status |
|-------|------|------|---------|--------|
| `kara_songs` | 9,676 | 9 MB | Legacy song catalog | ✅ Active |
| `kara_versions` | 11,776 | 2.7 MB | Song versions (tone/mixer/style) | ✅ Active |
| `kara_files` | 11,727 | 5.2 MB | Media files | ⚠️ 20% path issues |
| `kara_song_groups` | 6,829 | 1.9 MB | Song groupings by title | ✅ Active |
| `kara_song_group_members` | 9,609 | 2.2 MB | Song-to-group mappings | ⚠️ 67 orphans |
| `kara_users` | 7 | 96 KB | User accounts | ✅ Active |
| `kara_rooms` | 6 | 104 KB | Karaoke rooms | ✅ Active |
| `kara_queue` | 30 | 128 KB | Song queue | ✅ Active |
| `kara_song_history` | 3 | 72 KB | Play history | ✅ Active |
| `kara_user_preferences` | 1 | 88 KB | User settings & favorites | ✅ Active |
| `kara_room_participants` | ? | 104 KB | Room membership | ✅ Active |
| **Unused Tables** | | | | |
| `kara_artists` | 0 | 24 KB | Artist directory | ❌ Empty |
| `kara_languages` | ? | 40 KB | Language codes | 🤔 Check usage |
| `kara_lyrics` | 0 | 24 KB | Lyrics storage | ❌ Empty |
| `kara_tags` | 0 | 16 KB | Tag system | ❌ Empty |
| `kara_song_tags` | 0 | 8 KB | Song tag mappings | ❌ Empty |

**Total Database Size**: ~21.7 MB (data + indexes)

---

## Views Summary

| View | Purpose | Status |
|------|---------|--------|
| `kara_song_versions_view` | Search results (groups songs by title, counts versions) | ✅ Used in search |
| `kara_song_versions_detail_view` | Version details (extracts tone/mixer/style from path) | ✅ Used in version selector |
| `kara_files_with_title_norm` | Normalized file titles | 🤔 Helper view |
| `kara_files_with_title_clean` | Cleaned file titles | 🤔 Helper view |
| `kara_files_parsed_preview` | Parsed file metadata preview | 🤔 Debug/preview |

---

## Critical Issue #1: Storage Path Problems (2,373 files)

**Impact**: 20% of files have path separators classified as "Other" instead of standard forward slashes.

### Breakdown:
- ✅ **9,354 files (79.76%)**: Unix forward slashes `/` - GOOD
- ⚠️ **2,373 files (20.24%)**: "Other" - NEEDS INVESTIGATION
- ✅ **0 files**: Windows backslashes `\`
- ✅ **0 files**: Leading/trailing spaces
- ✅ **0 files**: Multiple consecutive slashes

### What is "Other"?
The SQL classified paths as "Other" when they don't contain ANY slashes (neither `/` nor `\`). This means **2,373 files have no path separators at all** - they're likely just filenames without directory structure.

### Example Query to Investigate:
```sql
SELECT storage_path
FROM kara_files
WHERE storage_path NOT LIKE '%/%' 
  AND storage_path NOT LIKE '%\%'
LIMIT 10;
```

### Recommended Action:
1. **Investigate** - Run query above to see examples
2. **Categorize** - Determine if these are:
   - Root-level files (intentional)
   - Missing path prefixes (error)
   - Different storage system (e.g., S3 keys without slashes)
3. **Decide** - Keep as-is or normalize with path prefix

---

## Critical Issue #2: Orphaned Songs (67 songs)

**Impact**: 67 songs in `kara_songs` table are not linked to any group in `kara_song_group_members`.

### Why This Matters:
- These songs won't appear in search results (search uses `kara_song_groups`)
- They may be leftover from old data migrations
- They consume database space without being accessible

### Investigation Query:
```sql
SELECT 
  s.id,
  s.title,
  s.artist_id,
  s.created_at
FROM kara_songs s
LEFT JOIN kara_song_group_members m ON s.id = m.song_id
WHERE m.song_id IS NULL
ORDER BY s.created_at DESC
LIMIT 20;
```

### Recommended Actions:
1. **Option A: Add to Groups** - Create groups and link these songs
2. **Option B: Soft Delete** - Mark as `is_active = false`
3. **Option C: Hard Delete** - Remove if truly orphaned/invalid

---

## Critical Issue #3: Duplicate Songs (20+ found)

**Impact**: Same song exists multiple times with identical title and artist_id.

### Top Duplicates (showing first 20):
1. "20 40" - 2 duplicates
2. "20 40 Dance" - 2 duplicates  
3. "Aespa Whiplash" - 2 duplicates
4. "Aespa Drama" - 2 duplicates
5. "Ai Dua Em Ve" - 2 duplicates
6. ... and 15 more

### Why Duplicates Exist:
- Manual song entry
- Import from multiple sources
- Different versions not properly grouped

### Impact on Search:
- Users see duplicate results
- Version counts are inflated
- Confusing UX

### Recommended Action:
Run full duplicate analysis:
```sql
SELECT 
  title,
  artist_id,
  COUNT(*) as dup_count,
  ARRAY_AGG(id) as song_ids,
  ARRAY_AGG(created_at ORDER BY created_at) as created_dates
FROM kara_songs
GROUP BY title, artist_id
HAVING COUNT(*) > 1
ORDER BY dup_count DESC, title;
```

Then **merge duplicates**:
1. Keep oldest song_id
2. Update all `kara_versions` to point to kept song
3. Update all `kara_song_group_members` to point to kept song
4. Update all `kara_queue` references
5. Update all `kara_song_history` references
6. Delete duplicate songs

---

## Schema Health: Foreign Keys ✅

All foreign key relationships are properly defined:

| From Table | Column | → To Table | To Column |
|------------|--------|------------|-----------|
| `kara_files` | `version_id` | → `kara_versions` | `id` |
| `kara_versions` | `song_id` | → `kara_songs` | `id` |
| `kara_song_group_members` | `song_id` | → `kara_songs` | `id` |
| `kara_song_group_members` | `group_id` | → `kara_song_groups` | `id` |
| `kara_queue` | `version_id` | → `kara_versions` | `id` |
| `kara_queue` | `song_id` | → `kara_songs` | `id` |
| `kara_queue` | `user_id` | → `kara_users` | `id` |
| `kara_queue` | `room_id` | → `kara_rooms` | `id` |
| `kara_song_history` | `song_id` | → `kara_songs` | `id` |
| `kara_song_history` | `user_id` | → `kara_users` | `id` |
| `kara_song_history` | `room_id` | → `kara_rooms` | `id` |
| `kara_rooms` | `host_id` | → `kara_users` | `id` |
| `kara_rooms` | `last_singer_id` | → `kara_users` | `id` |
| `kara_rooms` | `current_entry_id` | → `kara_queue` | `id` |
| `kara_user_preferences` | `user_id` | → `kara_users` | `id` |
| `kara_room_participants` | `user_id` | → `kara_users` | `id` |
| `kara_room_participants` | `room_id` | → `kara_rooms` | `id` |

**No referential integrity violations found!** ✅

---

## Schema Health: Indexes ✅

Comprehensive indexing for performance:

### Search Performance:
- ✅ `kara_songs.search_vector` - GIN index for full-text search
- ✅ `kara_songs.search_title_unaccent` - Unaccented search
- ✅ `kara_songs.base_title_unaccent` - Grouping by base title
- ✅ `kara_song_groups.base_title_unaccent` - Unique groups

### Join Performance:
- ✅ All foreign key columns are indexed
- ✅ Composite indexes on frequently joined columns

### Queue Performance:
- ✅ `idx_queue_one_playing_per_room` - Ensures only one song playing per room
- ✅ `idx_queue_position` - Efficient queue ordering

### Unique Constraints:
- ✅ `ux_kara_files_storage_path` - Prevents duplicate file paths
- ✅ `ux_kara_versions_song_label` - Prevents duplicate versions
- ✅ `ux_kara_songs_normalized_lang` - Prevents duplicate songs

---

## Unused/Empty Tables

### Should We Keep These?

| Table | Rows | Decision |
|-------|------|----------|
| `kara_artists` | 0 | 🗑️ **Consider Removing** - Not used, artist info extracted from file path |
| `kara_lyrics` | 0 | 🗑️ **Consider Removing** - Not implemented |
| `kara_tags` | 0 | 🗑️ **Consider Removing** - Tagging system not used |
| `kara_song_tags` | 0 | 🗑️ **Consider Removing** - Tagging system not used |
| `kara_languages` | ? | 🤔 **Check Usage** - May be used for filtering |

**Recommendation**: Remove unused tables in a migration to simplify schema and reduce maintenance burden.

---

## Next Steps - Priority Order

### 1. **Immediate** - Investigate "Other" Path Issue
```sql
-- Find examples of "Other" paths
SELECT storage_path, COUNT(*) as count
FROM kara_files
WHERE storage_path NOT LIKE '%/%' 
  AND storage_path NOT LIKE '%\%'
GROUP BY storage_path
ORDER BY count DESC
LIMIT 20;
```

### 2. **High Priority** - Fix Orphaned Songs
Create a script to either:
- Add orphaned songs to appropriate groups, OR
- Mark them as inactive/delete them

### 3. **High Priority** - Merge Duplicate Songs
Create a script to consolidate duplicates while preserving:
- Versions
- Queue entries
- History records
- Group memberships

### 4. **Medium Priority** - Remove Unused Tables
After confirming they're truly unused:
```sql
DROP TABLE IF EXISTS kara_artists CASCADE;
DROP TABLE IF EXISTS kara_lyrics CASCADE;
DROP TABLE IF EXISTS kara_tags CASCADE;
DROP TABLE IF EXISTS kara_song_tags CASCADE;
```

### 5. **Medium Priority** - Update schema.sql
Create canonical schema file reflecting actual database state.

### 6. **Low Priority** - Optimize Views
Consider creating materialized views for `kara_song_versions_view` if search is slow.

---

## Summary Statistics

| Metric | Value |
|--------|-------|
| **Total Tables** | 16 (12 active, 4 empty) |
| **Total Views** | 5 |
| **Total Records** | ~21,000 |
| **Total Database Size** | 21.7 MB |
| **Referential Integrity** | ✅ 100% |
| **Storage Path Issues** | ⚠️ 20% (2,373 files) |
| **Orphaned Records** | ⚠️ 67 songs |
| **Duplicate Songs** | ⚠️ 20+ found |
| **Index Coverage** | ✅ Excellent |
| **Foreign Key Coverage** | ✅ Complete |

---

## Questions to Answer

1. **What are the 2,373 files with no path separators?**
   - Are they root-level files?
   - Missing path prefix?
   - Different storage system?

2. **Should we keep empty tables?**
   - `kara_artists`, `kara_lyrics`, `kara_tags`, `kara_song_tags`
   - Are these planned for future use?

3. **How to handle duplicates?**
   - Merge automatically?
   - Manual review required?

4. **What about the 67 orphaned songs?**
   - Create groups for them?
   - Delete them?
   - Mark inactive?
