-- ============================================
-- FIX STORAGE_PATH: Add /Videos/ prefix to root-level files
-- ============================================
-- Date: 2026-01-17
-- Issue: 2,373 files missing /Videos/ prefix in storage_path
-- Goal: Make all paths consistent with format: /Videos/filename.mp4
-- 
-- SAFETY: This runs in a transaction - will rollback if any issues
-- ============================================

BEGIN;

-- ============================================
-- STEP 1: PRE-FLIGHT CHECKS
-- ============================================

-- Check 1: How many files need updating?
DO $$
DECLARE
  files_to_update INTEGER;
BEGIN
  SELECT COUNT(*) INTO files_to_update
  FROM kara_files
  WHERE storage_path NOT LIKE '%/%' 
    AND storage_path NOT LIKE '%\%';
  
  RAISE NOTICE 'Files to update: %', files_to_update;
  
  IF files_to_update = 0 THEN
    RAISE EXCEPTION 'No files need updating. Aborting.';
  END IF;
END $$;

-- Check 2: Will we create any duplicates?
DO $$
DECLARE
  potential_duplicates INTEGER;
BEGIN
  SELECT COUNT(*) INTO potential_duplicates
  FROM (
    SELECT '/Videos/' || storage_path as new_path
    FROM kara_files
    WHERE storage_path NOT LIKE '%/%' 
      AND storage_path NOT LIKE '%\%'
  ) AS new_paths
  WHERE new_path IN (
    SELECT storage_path 
    FROM kara_files
  );
  
  RAISE NOTICE 'Potential duplicate conflicts: %', potential_duplicates;
  
  IF potential_duplicates > 0 THEN
    RAISE EXCEPTION 'CONFLICT: % paths would create duplicates. Review conflicts before proceeding.', potential_duplicates;
  END IF;
END $$;

-- ============================================
-- STEP 2: CREATE BACKUP TABLE
-- ============================================

-- Backup files that will be modified
CREATE TABLE IF NOT EXISTS kara_files_backup_20260117_path_fix AS
SELECT * FROM kara_files
WHERE storage_path NOT LIKE '%/%' 
  AND storage_path NOT LIKE '%\%';

-- Verify backup
DO $$
DECLARE
  backup_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO backup_count FROM kara_files_backup_20260117_path_fix;
  RAISE NOTICE 'Backup created with % records', backup_count;
END $$;

-- ============================================
-- STEP 3: UPDATE STORAGE_PATH
-- ============================================

-- Add /Videos/ prefix to files without path separators
UPDATE kara_files
SET storage_path = '/Videos/' || storage_path
WHERE storage_path NOT LIKE '%/%' 
  AND storage_path NOT LIKE '%\%';

-- ============================================
-- STEP 4: VALIDATION
-- ============================================

-- Check 1: How many were updated?
DO $$
DECLARE
  updated_count INTEGER;
  backup_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO updated_count
  FROM kara_files f
  JOIN kara_files_backup_20260117_path_fix b ON f.id = b.id
  WHERE f.storage_path != b.storage_path;
  
  SELECT COUNT(*) INTO backup_count FROM kara_files_backup_20260117_path_fix;
  
  RAISE NOTICE 'Records updated: % (expected: %)', updated_count, backup_count;
  
  IF updated_count != backup_count THEN
    RAISE EXCEPTION 'MISMATCH: Expected % updates but got %', backup_count, updated_count;
  END IF;
END $$;

-- Check 2: Verify all paths now have /Videos/ prefix
DO $$
DECLARE
  files_without_separator INTEGER;
BEGIN
  SELECT COUNT(*) INTO files_without_separator
  FROM kara_files
  WHERE storage_path NOT LIKE '%/%' 
    AND storage_path NOT LIKE '%\%';
  
  RAISE NOTICE 'Files still without path separator: %', files_without_separator;
  
  IF files_without_separator > 0 THEN
    RAISE WARNING 'WARNING: % files still do not have path separators', files_without_separator;
  END IF;
END $$;

-- Check 3: Verify no duplicate storage_paths were created
DO $$
DECLARE
  duplicate_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO duplicate_count
  FROM (
    SELECT storage_path, COUNT(*) as count
    FROM kara_files
    GROUP BY storage_path
    HAVING COUNT(*) > 1
  ) dups;
  
  RAISE NOTICE 'Duplicate storage_paths: %', duplicate_count;
  
  IF duplicate_count > 0 THEN
    RAISE EXCEPTION 'DUPLICATES FOUND: % duplicate paths exist. Rolling back!', duplicate_count;
  END IF;
END $$;

-- ============================================
-- STEP 5: SHOW SAMPLE CHANGES
-- ============================================

-- Display before/after for verification
SELECT 
  'SAMPLE CHANGES' as info,
  b.storage_path as old_path,
  f.storage_path as new_path
FROM kara_files f
JOIN kara_files_backup_20260117_path_fix b ON f.id = b.id
WHERE f.storage_path != b.storage_path
LIMIT 10;

-- ============================================
-- STEP 6: FINAL STATISTICS
-- ============================================

SELECT 
  'FINAL STATS' as section,
  'Total files' as metric,
  COUNT(*) as count
FROM kara_files
UNION ALL
SELECT 
  'FINAL STATS',
  'Files with /Videos/ prefix',
  COUNT(*)
FROM kara_files
WHERE storage_path LIKE '/Videos/%'
UNION ALL
SELECT 
  'FINAL STATS',
  'Files with path separator',
  COUNT(*)
FROM kara_files
WHERE storage_path LIKE '%/%' OR storage_path LIKE '%\%'
UNION ALL
SELECT 
  'FINAL STATS',
  'Unique storage_paths',
  COUNT(DISTINCT storage_path)
FROM kara_files;

-- ============================================
-- COMMIT OR ROLLBACK
-- ============================================

-- Display final instructions
DO $$
BEGIN
  RAISE NOTICE '============================================';
  RAISE NOTICE 'TRANSACTION READY';
  RAISE NOTICE 'Review the output above.';
  RAISE NOTICE 'If everything looks good: COMMIT;';
  RAISE NOTICE 'If something is wrong: ROLLBACK;';
  RAISE NOTICE '============================================';
END $$;

-- If you see all checks passed above, run: COMMIT;
-- If anything looks wrong, run: ROLLBACK;

-- Uncomment ONE of these:
-- COMMIT;  -- Uncomment to apply changes
-- ROLLBACK;  -- Uncomment to undo everything
