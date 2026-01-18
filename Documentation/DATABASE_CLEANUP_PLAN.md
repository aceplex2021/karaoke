# Database Cleanup and Optimization Plan

**Date**: 2026-01-17  
**Goal**: Clean up database schema, fix storage_path issues, improve search quality

## Phase 1: Discovery & Analysis (Week 1)

### Step 1.1: Discover Actual Database Schema
**Script**: `database/analyze_database_schema.sql`

**Actions:**
```bash
# Run the analysis script
psql $DATABASE_URL -f database/analyze_database_schema.sql > database/schema_analysis_report.txt
```

**What We'll Learn:**
- All kara_* tables and their columns
- All kara_* views and their definitions
- All foreign keys and relationships
- All indexes
- Storage_path patterns and issues
- Duplicate records
- Data integrity problems
- Table sizes

### Step 1.2: Compare Schema Files vs Actual Database
**Script**: `database/compare_schema_vs_actual.sql`

**What to Check:**
- Tables in DB but not in schema.sql
- Tables in schema.sql but not in DB
- Column mismatches (type, nullable, default)
- Missing indexes
- Missing foreign keys
- View definitions that differ

### Step 1.3: Document Storage_Path Issues

**Known Issues to Investigate:**
1. **Path Separator Inconsistency**
   - Windows backslashes (`\`) vs Unix forward slashes (`/`)
   - Mixed separators in same path
   
2. **Duplicate Paths**
   - Same file referenced multiple times
   - Different IDs pointing to same physical file

3. **Path Encoding Issues**
   - Leading/trailing spaces
   - URL encoding inconsistencies
   - Special characters

4. **Relative vs Absolute Paths**
   - Some paths may be absolute
   - Some paths may be relative
   - Inconsistent base paths

## Phase 2: Schema Reconciliation (Week 1-2)

### Step 2.1: Create Canonical Schema Document
**File**: `database/canonical_schema.sql`

**Actions:**
1. Export actual database schema:
   ```bash
   pg_dump $DATABASE_URL --schema-only --schema=public > database/actual_schema_dump.sql
   ```

2. Review and clean up the dump:
   - Remove non-kara_* objects
   - Add proper comments
   - Organize by dependency order

3. Create canonical version combining:
   - Actual database state
   - Original schema.sql intent
   - New features added (groups, versions, etc.)

### Step 2.2: Identify Schema Drift
**Script**: `database/identify_schema_drift.sql`

**Find:**
- Missing columns that should exist
- Extra columns that shouldn't exist
- Type mismatches
- Missing constraints
- Index gaps

### Step 2.3: Create Migration Scripts
**Files**: `database/migrations/001_*.sql`, `002_*.sql`, etc.

**Migrations to Create:**
1. `001_add_missing_columns.sql` - Add any missing columns
2. `002_add_missing_indexes.sql` - Add missing indexes for performance
3. `003_add_missing_constraints.sql` - Add foreign keys, checks
4. `004_normalize_storage_paths.sql` - Fix storage_path issues
5. `005_remove_duplicates.sql` - Handle duplicate records
6. `006_update_views.sql` - Recreate views to match new schema

## Phase 3: Storage_Path Normalization (Week 2)

### Step 3.1: Analyze Path Patterns
**Script**: `database/analyze_storage_paths.sql`

**Query to run:**
```sql
-- Get all distinct path patterns
SELECT 
  REGEXP_REPLACE(storage_path, '[^/\\]+$', '<filename>') as path_pattern,
  COUNT(*) as count,
  ARRAY_AGG(DISTINCT storage_path) FILTER (WHERE random() < 0.1) as samples
FROM kara_files
GROUP BY path_pattern
ORDER BY count DESC;
```

### Step 3.2: Define Normalization Rules

**Standard Format Decision:**
- Choose: Forward slashes `/` (Unix-style) for consistency
- Trim leading/trailing whitespace
- Remove duplicate slashes
- URL decode if needed
- Ensure relative paths from consistent base

**Example Transformation:**
```
BEFORE: "Videos\Karaoke\\Song Title (Artist).mp4"
AFTER:  "Videos/Karaoke/Song Title (Artist).mp4"

BEFORE: "  /path/to/file.mp4  "
AFTER:  "path/to/file.mp4"

BEFORE: "path//to///file.mp4"
AFTER:  "path/to/file.mp4"
```

### Step 3.3: Create Normalization Function
**Script**: `database/create_normalize_storage_path_function.sql`

```sql
CREATE OR REPLACE FUNCTION normalize_storage_path(path TEXT) 
RETURNS TEXT AS $$
BEGIN
  -- Trim whitespace
  path := TRIM(path);
  
  -- Replace backslashes with forward slashes
  path := REPLACE(path, '\', '/');
  
  -- Remove duplicate slashes
  WHILE path LIKE '%//%' LOOP
    path := REPLACE(path, '//', '/');
  END LOOP;
  
  -- Remove leading slash if present
  IF path LIKE '/%' THEN
    path := SUBSTRING(path FROM 2);
  END IF;
  
  RETURN path;
END;
$$ LANGUAGE plpgsql IMMUTABLE;
```

### Step 3.4: Test Normalization (Dry Run)
**Script**: `database/test_storage_path_normalization.sql`

```sql
-- Show what would change (don't actually change yet)
SELECT 
  id,
  storage_path as old_path,
  normalize_storage_path(storage_path) as new_path,
  storage_path != normalize_storage_path(storage_path) as will_change
FROM kara_files
WHERE storage_path != normalize_storage_path(storage_path)
ORDER BY will_change DESC
LIMIT 50;
```

### Step 3.5: Handle Duplicates BEFORE Normalization
**Script**: `database/handle_duplicate_files.sql`

**Strategy:**
1. Find files that will become duplicates after normalization
2. For each duplicate set:
   - Keep the one with the most references (queue, history)
   - Keep the oldest one if reference count is equal
   - Update foreign keys to point to kept record
   - Delete duplicates

```sql
-- Find potential duplicates after normalization
WITH normalized AS (
  SELECT 
    id,
    storage_path,
    normalize_storage_path(storage_path) as norm_path,
    version_id,
    created_at
  FROM kara_files
)
SELECT 
  norm_path,
  COUNT(*) as duplicate_count,
  ARRAY_AGG(id ORDER BY created_at) as file_ids,
  ARRAY_AGG(storage_path) as original_paths
FROM normalized
GROUP BY norm_path
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC;
```

### Step 3.6: Apply Normalization
**Script**: `database/apply_storage_path_normalization.sql`

```sql
-- Backup first!
CREATE TABLE kara_files_backup_20260117 AS 
SELECT * FROM kara_files;

-- Apply normalization
UPDATE kara_files
SET storage_path = normalize_storage_path(storage_path)
WHERE storage_path != normalize_storage_path(storage_path);

-- Verify
SELECT COUNT(*) as normalized_count
FROM kara_files_backup_20260117 b
JOIN kara_files f ON b.id = f.id
WHERE b.storage_path != f.storage_path;
```

## Phase 4: Duplicate Removal (Week 2-3)

### Step 4.1: Identify All Duplicate Types

**Categories:**
1. **Duplicate Files** - Same storage_path (after normalization)
2. **Duplicate Songs** - Same title + artist
3. **Duplicate Versions** - Same song_id + label
4. **Duplicate Groups** - Same base_title

### Step 4.2: Remove Duplicate Files
**Script**: `database/remove_duplicate_files.sql`

**Strategy:**
```sql
-- For each duplicate storage_path:
-- 1. Find the "canonical" file (most used, or oldest)
-- 2. Update all references to point to canonical
-- 3. Delete duplicates

WITH duplicates AS (
  SELECT 
    storage_path,
    ARRAY_AGG(id ORDER BY created_at) as file_ids,
    (ARRAY_AGG(id ORDER BY created_at))[1] as keep_id
  FROM kara_files
  GROUP BY storage_path
  HAVING COUNT(*) > 1
),
to_delete AS (
  SELECT 
    UNNEST(file_ids[2:]) as delete_id,
    keep_id
  FROM duplicates
)
-- Update version_id references first...
-- Then delete
DELETE FROM kara_files
WHERE id IN (SELECT delete_id FROM to_delete);
```

### Step 4.3: Remove Duplicate Songs
**Script**: `database/remove_duplicate_songs.sql`

**Careful!** Songs might be legitimately different even with same title/artist:
- Check if they're in different groups
- Check if they have different versions
- Manual review may be needed

### Step 4.4: Remove Duplicate Versions
**Script**: `database/remove_duplicate_versions.sql`

Same song_id + label should be unique. Handle carefully:
- Check which version is more complete
- Check which has more associated files
- Update queue/history references

## Phase 5: Data Integrity (Week 3)

### Step 5.1: Fix Orphaned Records
**Script**: `database/fix_orphaned_records.sql`

**Clean up:**
1. Files without versions → Delete or assign to new version
2. Versions without songs → Delete
3. Songs not in any group → Add to appropriate group or delete
4. Queue items with invalid version_id → Delete
5. History items with invalid song_id → Delete

### Step 5.2: Add Missing Constraints
**Script**: `database/add_missing_constraints.sql`

**Add:**
- Foreign key constraints
- Unique constraints where appropriate
- Check constraints for data validation
- Not null constraints

### Step 5.3: Rebuild Indexes
**Script**: `database/rebuild_indexes.sql`

```sql
-- Drop and recreate indexes for better performance
REINDEX TABLE kara_files;
REINDEX TABLE kara_songs;
REINDEX TABLE kara_versions;
-- etc.
```

## Phase 6: View Updates (Week 3)

### Step 6.1: Update All Views
**Script**: `database/update_all_views.sql`

**Views to update:**
1. `kara_song_versions_view` - Search view
2. `kara_song_versions_detail_view` - Detail view
3. Any other views

**Ensure:**
- Views use normalized storage_path
- Views reference correct relationships
- Views perform well (check execution plans)

### Step 6.2: Add Materialized Views for Performance
**Script**: `database/create_materialized_views.sql`

**Consider creating:**
```sql
CREATE MATERIALIZED VIEW kara_search_cache AS
SELECT 
  g.id as group_id,
  g.base_title_display,
  g.base_title_unaccent,
  COUNT(DISTINCT v.id) as version_count,
  ARRAY_AGG(DISTINCT a.name) as artists
FROM kara_song_groups g
-- ... joins ...
GROUP BY g.id;

-- Refresh periodically
CREATE INDEX ON kara_search_cache (base_title_unaccent);
```

## Phase 7: Testing & Validation (Week 3-4)

### Step 7.1: Validation Queries
**Script**: `database/validate_cleanup.sql`

**Check:**
- No duplicate storage_paths
- All paths normalized
- No orphaned records
- All foreign keys valid
- Search returns expected results
- View performance acceptable

### Step 7.2: Search Quality Testing

**Test cases:**
1. Search for common songs → Check result count vs before
2. Check duplicate results → Should be eliminated
3. Check version counts → Should be accurate
4. Check search speed → Should be same or faster

### Step 7.3: Application Testing

**Test:**
1. Search tab works correctly
2. Version selector shows all versions
3. Add to queue works
4. History/Favorites work
5. TV playback works

## Phase 8: Documentation (Week 4)

### Step 8.1: Update Schema Documentation
**Files:**
- `database/README.md` - Overview
- `database/SCHEMA.md` - Complete schema reference
- `database/MIGRATIONS.md` - Migration history

### Step 8.2: Create Maintenance Scripts
**Scripts:**
- `database/maintenance/check_health.sql` - Regular health checks
- `database/maintenance/find_duplicates.sql` - Ongoing monitoring
- `database/maintenance/vacuum_analyze.sql` - Performance maintenance

## Execution Timeline

**Week 1:**
- Days 1-2: Discovery and analysis
- Days 3-5: Schema reconciliation
- Days 6-7: Storage_path analysis and planning

**Week 2:**
- Days 1-3: Storage_path normalization
- Days 4-7: Duplicate removal

**Week 3:**
- Days 1-3: Data integrity fixes
- Days 4-5: View updates
- Days 6-7: Testing

**Week 4:**
- Days 1-2: Final validation
- Days 3-4: Documentation
- Days 5-7: Buffer for issues

## Risk Mitigation

### Backups Before Each Phase
```bash
# Full database backup
pg_dump $DATABASE_URL > backups/before_phase_X_$(date +%Y%m%d_%H%M%S).sql

# Table-specific backups
pg_dump $DATABASE_URL -t kara_files > backups/kara_files_backup.sql
```

### Rollback Plan
Each migration script should include:
1. Backup creation
2. Migration logic
3. Validation queries
4. Rollback SQL (commented)

### Staging Environment
- Test all migrations on staging first
- Compare staging vs production results
- Get user approval before production

## Success Criteria

**Must Have:**
- ✅ All storage_paths normalized (consistent format)
- ✅ No duplicate files with same storage_path
- ✅ Schema.sql matches actual database
- ✅ All orphaned records cleaned up
- ✅ Search returns accurate results

**Nice to Have:**
- ✅ Improved search performance (measured)
- ✅ Reduced database size (duplicates removed)
- ✅ Materialized views for faster search
- ✅ Automated health checks

## Next Steps

1. **Review this plan** - Confirm approach
2. **Run discovery script** - See actual state
3. **Prioritize issues** - Based on discovery results
4. **Execute phase by phase** - With testing between each
5. **Monitor results** - Track improvements

---

**Let's start with Phase 1: Discovery!**

Run this command and share the results:
```bash
psql $DATABASE_URL -f database/analyze_database_schema.sql > database/schema_analysis_report.txt
cat database/schema_analysis_report.txt
```

This will show us exactly what we're working with.
