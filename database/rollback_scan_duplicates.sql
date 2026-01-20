-- ============================================================
-- Rollback Scan Duplicates
-- ============================================================
-- Deletes kara_files and kara_versions created during the failed scan
-- ONLY deletes records created in the last 20 minutes (when scan ran)
-- Run this ONLY if you don't have Supabase backups
-- ============================================================

-- SAFETY: Check what will be deleted first (DRY RUN)
-- Uncomment to see affected records:

-- SELECT 
--   f.id as file_id,
--   f.storage_path,
--   f.created_at as file_created,
--   v.id as version_id,
--   v.title_display,
--   v.created_at as version_created
-- FROM kara_files f
-- JOIN kara_versions v ON f.version_id = v.id
-- WHERE f.created_at > NOW() - INTERVAL '20 minutes'
-- ORDER BY f.created_at DESC;

-- ============================================================
-- STEP 1: Delete kara_files created in last 20 minutes
-- ============================================================

BEGIN;

-- Store deleted file IDs for cleanup
CREATE TEMP TABLE deleted_files AS
SELECT f.id, f.version_id, f.storage_path
FROM kara_files f
WHERE f.created_at > NOW() - INTERVAL '20 minutes';

-- Show what will be deleted
SELECT 
  COUNT(*) as files_to_delete,
  MIN(created_at) as oldest_record,
  MAX(created_at) as newest_record
FROM kara_files
WHERE created_at > NOW() - INTERVAL '20 minutes';

-- Delete the files
DELETE FROM kara_files
WHERE created_at > NOW() - INTERVAL '20 minutes';

-- ============================================================
-- STEP 2: Delete orphaned kara_versions (no files reference them)
-- ============================================================

-- Find versions that no longer have any files
CREATE TEMP TABLE orphaned_versions AS
SELECT DISTINCT v.id
FROM kara_versions v
WHERE v.id IN (SELECT DISTINCT version_id FROM deleted_files)
  AND NOT EXISTS (
    SELECT 1 FROM kara_files f WHERE f.version_id = v.id
  );

-- Show orphaned versions count
SELECT COUNT(*) as orphaned_versions_to_delete FROM orphaned_versions;

-- Delete orphaned versions
DELETE FROM kara_versions
WHERE id IN (SELECT id FROM orphaned_versions);

-- ============================================================
-- STEP 3: Verify final counts
-- ============================================================

SELECT 
  'kara_files' as table_name,
  COUNT(*) as final_count
FROM kara_files
UNION ALL
SELECT 
  'kara_versions' as table_name,
  COUNT(*) as final_count
FROM kara_versions;

-- If everything looks good, commit the transaction
-- If not, rollback with: ROLLBACK;

-- COMMIT; -- Uncomment to actually delete

ROLLBACK; -- Remove this line and uncomment COMMIT above to actually delete
