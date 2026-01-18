-- Database Schema Discovery and Analysis
-- Phase 1: Discover all kara_* tables and views with their columns

-- ============================================
-- 1. LIST ALL KARA_* TABLES
-- ============================================
SELECT 
  'TABLE' as object_type,
  table_name,
  NULL as view_definition
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name LIKE 'kara_%'
  AND table_type = 'BASE TABLE'
ORDER BY table_name;

-- ============================================
-- 2. LIST ALL KARA_* VIEWS
-- ============================================
SELECT 
  'VIEW' as object_type,
  table_name,
  view_definition
FROM information_schema.views 
WHERE table_schema = 'public' 
  AND table_name LIKE 'kara_%'
ORDER BY table_name;

-- ============================================
-- 3. GET DETAILED COLUMN INFO FOR ALL KARA_* TABLES
-- ============================================
SELECT 
  table_name,
  column_name,
  data_type,
  character_maximum_length,
  is_nullable,
  column_default,
  ordinal_position
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name LIKE 'kara_%'
  AND table_name IN (
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
  )
ORDER BY table_name, ordinal_position;

-- ============================================
-- 4. GET ALL FOREIGN KEYS FOR KARA_* TABLES
-- ============================================
SELECT
  tc.table_name AS from_table,
  kcu.column_name AS from_column,
  ccu.table_name AS to_table,
  ccu.column_name AS to_column,
  tc.constraint_name
FROM information_schema.table_constraints AS tc 
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
  AND tc.table_name LIKE 'kara_%'
ORDER BY tc.table_name, kcu.column_name;

-- ============================================
-- 5. GET ALL INDEXES FOR KARA_* TABLES
-- ============================================
SELECT
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename LIKE 'kara_%'
ORDER BY tablename, indexname;

-- ============================================
-- 6. ANALYZE STORAGE_PATH PATTERNS
-- ============================================

-- Count distinct storage_path patterns
SELECT 
  'Total files' as metric,
  COUNT(*) as count
FROM kara_files
UNION ALL
SELECT 
  'Unique storage_paths' as metric,
  COUNT(DISTINCT storage_path) as count
FROM kara_files
UNION ALL
SELECT 
  'Paths with backslashes' as metric,
  COUNT(*) as count
FROM kara_files
WHERE storage_path LIKE '%\%'
UNION ALL
SELECT 
  'Paths with forward slashes' as metric,
  COUNT(*) as count
FROM kara_files
WHERE storage_path LIKE '%/%';

-- Show sample storage_path variations
SELECT 
  storage_path,
  COUNT(*) as count,
  MIN(created_at) as first_seen,
  MAX(created_at) as last_seen
FROM kara_files
GROUP BY storage_path
HAVING COUNT(*) > 1
ORDER BY count DESC
LIMIT 20;

-- Check if storage_path has leading/trailing spaces
SELECT 
  'Paths with leading spaces' as issue,
  COUNT(*) as count
FROM kara_files
WHERE storage_path != TRIM(storage_path)
UNION ALL
SELECT 
  'Paths with multiple consecutive slashes' as issue,
  COUNT(*) as count
FROM kara_files
WHERE storage_path LIKE '%//%' OR storage_path LIKE '%\\%';

-- ============================================
-- 7. FIND POTENTIAL DUPLICATES
-- ============================================

-- Duplicate songs (same title and artist)
SELECT 
  title,
  artist_id,
  COUNT(*) as count,
  ARRAY_AGG(id) as song_ids
FROM kara_songs
GROUP BY title, artist_id
HAVING COUNT(*) > 1
ORDER BY count DESC
LIMIT 20;

-- Duplicate files (same storage_path)
SELECT 
  storage_path,
  COUNT(*) as count,
  ARRAY_AGG(id) as file_ids,
  ARRAY_AGG(version_id) as version_ids
FROM kara_files
GROUP BY storage_path
HAVING COUNT(*) > 1
ORDER BY count DESC
LIMIT 20;

-- Duplicate versions (same song_id and label)
SELECT 
  song_id,
  label,
  COUNT(*) as count,
  ARRAY_AGG(id) as version_ids
FROM kara_versions
GROUP BY song_id, label
HAVING COUNT(*) > 1
ORDER BY count DESC
LIMIT 20;

-- ============================================
-- 8. CHECK DATA INTEGRITY ISSUES
-- ============================================

-- Files without versions
SELECT COUNT(*) as orphaned_files
FROM kara_files f
LEFT JOIN kara_versions v ON f.version_id = v.id
WHERE v.id IS NULL;

-- Versions without songs
SELECT COUNT(*) as orphaned_versions
FROM kara_versions v
LEFT JOIN kara_songs s ON v.song_id = s.id
WHERE s.id IS NULL;

-- Songs not in any group
SELECT COUNT(*) as ungrouped_songs
FROM kara_songs s
LEFT JOIN kara_song_group_members m ON s.id = m.song_id
WHERE m.song_id IS NULL;

-- Queue items with invalid version_id
SELECT COUNT(*) as invalid_queue_items
FROM kara_queue q
LEFT JOIN kara_versions v ON q.version_id = v.id
WHERE q.version_id IS NOT NULL AND v.id IS NULL;

-- History items with invalid song_id
SELECT COUNT(*) as invalid_history_items
FROM kara_song_history h
LEFT JOIN kara_songs s ON h.song_id = s.id
WHERE s.id IS NULL;

-- ============================================
-- 9. STORAGE_PATH NORMALIZATION ANALYSIS
-- ============================================

-- Show different path separators used
SELECT 
  CASE 
    WHEN storage_path LIKE '%\%' AND storage_path NOT LIKE '%/%' THEN 'Windows (backslash only)'
    WHEN storage_path LIKE '%/%' AND storage_path NOT LIKE '%\%' THEN 'Unix (forward slash only)'
    WHEN storage_path LIKE '%\%' AND storage_path LIKE '%/%' THEN 'Mixed (both separators)'
    ELSE 'Other'
  END as path_type,
  COUNT(*) as count,
  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) as percentage
FROM kara_files
GROUP BY path_type
ORDER BY count DESC;

-- Sample paths for each type
SELECT 
  'Windows backslash example' as type,
  storage_path
FROM kara_files
WHERE storage_path LIKE '%\%' AND storage_path NOT LIKE '%/%'
LIMIT 3
UNION ALL
SELECT 
  'Unix forward slash example' as type,
  storage_path
FROM kara_files
WHERE storage_path LIKE '%/%' AND storage_path NOT LIKE '%\%'
LIMIT 3
UNION ALL
SELECT 
  'Mixed separators example' as type,
  storage_path
FROM kara_files
WHERE storage_path LIKE '%\%' AND storage_path LIKE '%/%'
LIMIT 3;

-- ============================================
-- 10. TABLE SIZE ANALYSIS
-- ============================================
SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS total_size,
  pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) AS table_size,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename) - pg_relation_size(schemaname||'.'||tablename)) AS indexes_size
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename LIKE 'kara_%'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
