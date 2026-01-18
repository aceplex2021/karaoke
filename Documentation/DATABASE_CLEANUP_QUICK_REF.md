# Database Cleanup - Quick Reference

**Created**: 2026-01-17  
**Full Plan**: See `DATABASE_CLEANUP_PLAN.md`  
**Analysis**: See `DATABASE_ANALYSIS_FINDINGS.md`

## Files Created

1. **`canonical_schema.sql`** - Source of truth for database structure
2. **`DATABASE_ANALYSIS_FINDINGS.md`** - Detailed analysis with all issues
3. **`DATABASE_CLEANUP_PLAN.md`** - 8-phase cleanup roadmap

## Critical Issues Found

| Issue | Count | Priority | Script |
|-------|-------|----------|--------|
| Files with no path separators | 2,373 (20%) | 🔴 HIGH | Need investigation query |
| Orphaned songs (no group) | 67 | 🟡 MEDIUM | `fix_orphaned_songs.sql` (TBD) |
| Duplicate songs | 20+ | 🟡 MEDIUM | `merge_duplicate_songs.sql` (TBD) |
| Empty unused tables | 4 | 🟢 LOW | `drop_unused_tables.sql` (TBD) |

## Next Steps

### Step 1: Investigate Path Issue (URGENT)
Run this in Supabase SQL Editor:

```sql
-- Find examples of files with no path separators
SELECT 
  storage_path,
  COUNT(*) as count,
  MIN(created_at) as first_seen,
  type,
  format
FROM kara_files
WHERE storage_path NOT LIKE '%/%' 
  AND storage_path NOT LIKE '%\%'
GROUP BY storage_path, type, format
ORDER BY count DESC
LIMIT 50;
```

**Questions to answer:**
- Are these root-level files?
- Missing path prefix?
- Different storage system?

### Step 2: Fix Orphaned Songs
Run this to see which songs:

```sql
SELECT 
  s.id,
  s.title,
  s.artist_id,
  s.created_at,
  s.base_title_unaccent
FROM kara_songs s
LEFT JOIN kara_song_group_members m ON s.id = m.song_id
WHERE m.song_id IS NULL
ORDER BY s.created_at DESC;
```

**Decision needed:**
- Add to groups?
- Mark inactive?
- Delete?

### Step 3: Handle Duplicates
Full duplicate report:

```sql
SELECT 
  title,
  artist_id,
  COUNT(*) as dup_count,
  ARRAY_AGG(id ORDER BY created_at) as song_ids,
  ARRAY_AGG(created_at ORDER BY created_at) as dates
FROM kara_songs
GROUP BY title, artist_id
HAVING COUNT(*) > 1
ORDER BY dup_count DESC, title;
```

**Strategy:**
- Keep oldest song_id
- Update all references
- Delete duplicates

## Schema Files

| File | Purpose | Status |
|------|---------|--------|
| `canonical_schema.sql` | ✅ Source of truth | Up to date |
| `schema.sql` | ⚠️ Original file | Out of date - DO NOT USE |
| `DATABASE_ANALYSIS_FINDINGS.md` | ✅ Analysis report | Current |
| `DATABASE_CLEANUP_PLAN.md` | ✅ Full 8-phase plan | Current |

## Team Instructions

**For new developers:**
1. Use `canonical_schema.sql` as reference
2. Read `DATABASE_ANALYSIS_FINDINGS.md` for current state
3. Don't use old `schema.sql` - it's outdated

**For database migrations:**
1. Test on staging first
2. Back up before running
3. Follow `DATABASE_CLEANUP_PLAN.md` phases

## Quick Stats

- **Tables**: 16 (12 active, 4 empty/unused)
- **Views**: 5
- **Total Records**: ~21,000
- **Database Size**: 21.7 MB
- **Health**: ✅ Good referential integrity
- **Issues**: ⚠️ Path normalization, orphans, duplicates
