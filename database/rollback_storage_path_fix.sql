-- ============================================
-- ROLLBACK SCRIPT - If Something Goes Wrong
-- ============================================
-- Date: 2026-01-17
-- Use this ONLY if you need to undo the storage_path changes
-- 
-- This script restores the original storage_path values
-- from the backup table created during the fix
-- ============================================

BEGIN;

-- Verify backup exists
DO $$
DECLARE
  backup_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT FROM pg_tables 
    WHERE schemaname = 'public' 
    AND tablename = 'kara_files_backup_20260117_path_fix'
  ) INTO backup_exists;
  
  IF NOT backup_exists THEN
    RAISE EXCEPTION 'Backup table does not exist. Cannot rollback.';
  END IF;
  
  RAISE NOTICE 'Backup table found. Proceeding with rollback...';
END $$;

-- Restore original storage_path values
UPDATE kara_files f
SET storage_path = b.storage_path
FROM kara_files_backup_20260117_path_fix b
WHERE f.id = b.id;

-- Verify restoration
DO $$
DECLARE
  restored_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO restored_count
  FROM kara_files f
  JOIN kara_files_backup_20260117_path_fix b ON f.id = b.id
  WHERE f.storage_path = b.storage_path;
  
  RAISE NOTICE 'Records restored: %', restored_count;
END $$;

-- Show sample of restored paths
SELECT 
  'RESTORED PATHS' as info,
  storage_path
FROM kara_files
WHERE id IN (
  SELECT id FROM kara_files_backup_20260117_path_fix LIMIT 10
);

COMMIT;

RAISE NOTICE 'Rollback complete. Original paths restored.';
