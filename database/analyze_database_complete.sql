-- ============================================
-- COMPREHENSIVE DATABASE ANALYSIS REPORT
-- Run this entire script in Supabase SQL Editor
-- All results will be shown in one consolidated view
-- ============================================

-- Create a temp table to store all analysis results
CREATE TEMP TABLE analysis_results (
  section TEXT,
  subsection TEXT,
  key TEXT,
  value TEXT,
  details JSONB
);

-- ============================================
-- SECTION 1: ALL KARA_* TABLES
-- ============================================
INSERT INTO analysis_results (section, subsection, key, value, details)
SELECT 
  '1. Tables' as section,
  'Tables' as subsection,
  table_name as key,
  table_type as value,
  jsonb_build_object(
    'schema', table_schema,
    'type', table_type
  ) as details
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name LIKE 'kara_%'
  AND table_type = 'BASE TABLE'
ORDER BY table_name;

-- ============================================
-- SECTION 2: ALL KARA_* VIEWS
-- ============================================
INSERT INTO analysis_results (section, subsection, key, value, details)
SELECT 
  '2. Views' as section,
  'Views' as subsection,
  table_name as key,
  'VIEW' as value,
  jsonb_build_object(
    'definition', LEFT(view_definition, 200)
  ) as details
FROM information_schema.views 
WHERE table_schema = 'public' 
  AND table_name LIKE 'kara_%'
ORDER BY table_name;

-- ============================================
-- SECTION 3: COLUMN COUNTS PER TABLE
-- ============================================
INSERT INTO analysis_results (section, subsection, key, value, details)
SELECT 
  '3. Schema Details' as section,
  'Column Counts' as subsection,
  table_name as key,
  COUNT(*)::TEXT as value,
  jsonb_agg(
    jsonb_build_object(
      'column', column_name,
      'type', data_type,
      'nullable', is_nullable
    ) ORDER BY ordinal_position
  ) as details
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name LIKE 'kara_%'
  AND table_name IN (
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
  )
GROUP BY table_name
ORDER BY table_name;

-- ============================================
-- SECTION 4: FOREIGN KEY RELATIONSHIPS
-- ============================================
INSERT INTO analysis_results (section, subsection, key, value, details)
SELECT 
  '4. Relationships' as section,
  'Foreign Keys' as subsection,
  tc.table_name as key,
  COUNT(*)::TEXT as value,
  jsonb_agg(
    jsonb_build_object(
      'from', kcu.column_name,
      'to_table', ccu.table_name,
      'to_column', ccu.column_name,
      'constraint', tc.constraint_name
    )
  ) as details
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
GROUP BY tc.table_name
ORDER BY tc.table_name;

-- ============================================
-- SECTION 5: INDEX COUNTS
-- ============================================
INSERT INTO analysis_results (section, subsection, key, value, details)
SELECT 
  '5. Performance' as section,
  'Indexes' as subsection,
  tablename as key,
  COUNT(*)::TEXT as value,
  jsonb_agg(
    jsonb_build_object(
      'index_name', indexname,
      'definition', indexdef
    )
  ) as details
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename LIKE 'kara_%'
GROUP BY tablename
ORDER BY tablename;

-- ============================================
-- SECTION 6: STORAGE_PATH ANALYSIS
-- ============================================
INSERT INTO analysis_results (section, subsection, key, value, details)
SELECT 
  '6. Storage Paths' as section,
  'Statistics' as subsection,
  metric as key,
  count::TEXT as value,
  NULL::jsonb as details
FROM (
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
  WHERE storage_path LIKE '%/%'
  UNION ALL
  SELECT 
    'Paths with leading/trailing spaces' as metric,
    COUNT(*) as count
  FROM kara_files
  WHERE storage_path != TRIM(storage_path)
  UNION ALL
  SELECT 
    'Paths with multiple slashes' as metric,
    COUNT(*) as count
  FROM kara_files
  WHERE storage_path LIKE '%//%' OR storage_path LIKE '%\\%'
) stats;

-- Path separator breakdown
INSERT INTO analysis_results (section, subsection, key, value, details)
SELECT 
  '6. Storage Paths' as section,
  'Path Separators' as subsection,
  path_type as key,
  count::TEXT || ' (' || percentage::TEXT || '%)' as value,
  NULL::jsonb as details
FROM (
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
) path_stats
ORDER BY count DESC;

-- ============================================
-- SECTION 7: DUPLICATES ANALYSIS
-- ============================================
INSERT INTO analysis_results (section, subsection, key, value, details)
SELECT 
  '7. Duplicates' as section,
  'Duplicate Files (same storage_path)' as subsection,
  storage_path as key,
  count::TEXT || ' duplicates' as value,
  jsonb_build_object(
    'file_ids', file_ids,
    'version_ids', version_ids,
    'first_seen', first_seen,
    'last_seen', last_seen
  ) as details
FROM (
  SELECT 
    storage_path,
    COUNT(*) as count,
    ARRAY_AGG(id) as file_ids,
    ARRAY_AGG(version_id) as version_ids,
    MIN(created_at) as first_seen,
    MAX(created_at) as last_seen
  FROM kara_files
  GROUP BY storage_path
  HAVING COUNT(*) > 1
  ORDER BY count DESC
  LIMIT 20
) dups;

INSERT INTO analysis_results (section, subsection, key, value, details)
SELECT 
  '7. Duplicates' as section,
  'Duplicate Songs (same title+artist)' as subsection,
  title as key,
  count::TEXT || ' duplicates' as value,
  jsonb_build_object(
    'artist_id', artist_id,
    'song_ids', song_ids
  ) as details
FROM (
  SELECT 
    title,
    artist_id,
    COUNT(*) as count,
    ARRAY_AGG(id) as song_ids
  FROM kara_songs
  GROUP BY title, artist_id
  HAVING COUNT(*) > 1
  ORDER BY count DESC
  LIMIT 20
) song_dups;

INSERT INTO analysis_results (section, subsection, key, value, details)
SELECT 
  '7. Duplicates' as section,
  'Duplicate Versions (same song+label)' as subsection,
  song_id::TEXT || ' - ' || label as key,
  count::TEXT || ' duplicates' as value,
  jsonb_build_object(
    'version_ids', version_ids
  ) as details
FROM (
  SELECT 
    song_id,
    label,
    COUNT(*) as count,
    ARRAY_AGG(id) as version_ids
  FROM kara_versions
  GROUP BY song_id, label
  HAVING COUNT(*) > 1
  ORDER BY count DESC
  LIMIT 20
) version_dups;

-- ============================================
-- SECTION 8: DATA INTEGRITY ISSUES
-- ============================================
INSERT INTO analysis_results (section, subsection, key, value, details)
SELECT 
  '8. Data Integrity' as section,
  'Orphaned Records' as subsection,
  issue as key,
  count::TEXT as value,
  NULL::jsonb as details
FROM (
  SELECT 
    'Files without versions' as issue,
    COUNT(*) as count
  FROM kara_files f
  LEFT JOIN kara_versions v ON f.version_id = v.id
  WHERE v.id IS NULL
  UNION ALL
  SELECT 
    'Versions without songs' as issue,
    COUNT(*) as count
  FROM kara_versions v
  LEFT JOIN kara_songs s ON v.song_id = s.id
  WHERE s.id IS NULL
  UNION ALL
  SELECT 
    'Songs not in any group' as issue,
    COUNT(*) as count
  FROM kara_songs s
  LEFT JOIN kara_song_group_members m ON s.id = m.song_id
  WHERE m.song_id IS NULL
  UNION ALL
  SELECT 
    'Queue items with invalid version_id' as issue,
    COUNT(*) as count
  FROM kara_queue q
  LEFT JOIN kara_versions v ON q.version_id = v.id
  WHERE q.version_id IS NOT NULL AND v.id IS NULL
  UNION ALL
  SELECT 
    'History items with invalid song_id' as issue,
    COUNT(*) as count
  FROM kara_song_history h
  LEFT JOIN kara_songs s ON h.song_id = s.id
  WHERE s.id IS NULL
) integrity_issues;

-- ============================================
-- SECTION 9: TABLE SIZES
-- ============================================
INSERT INTO analysis_results (section, subsection, key, value, details)
SELECT 
  '9. Table Sizes' as section,
  'Storage Usage' as subsection,
  tablename as key,
  total_size as value,
  jsonb_build_object(
    'table_size', table_size,
    'indexes_size', indexes_size,
    'total_bytes', total_bytes
  ) as details
FROM (
  SELECT 
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS total_size,
    pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) AS table_size,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename) - pg_relation_size(schemaname||'.'||tablename)) AS indexes_size,
    pg_total_relation_size(schemaname||'.'||tablename) as total_bytes
  FROM pg_tables
  WHERE schemaname = 'public'
    AND tablename LIKE 'kara_%'
) sizes
ORDER BY total_bytes DESC;

-- ============================================
-- SECTION 10: ROW COUNTS
-- ============================================
INSERT INTO analysis_results (section, subsection, key, value, details)
SELECT 
  '10. Row Counts' as section,
  'Record Counts' as subsection,
  'kara_songs' as key,
  (SELECT COUNT(*)::TEXT FROM kara_songs) as value,
  NULL::jsonb as details
UNION ALL
SELECT '10. Row Counts', 'Record Counts', 'kara_versions',
  (SELECT COUNT(*)::TEXT FROM kara_versions), NULL::jsonb
UNION ALL
SELECT '10. Row Counts', 'Record Counts', 'kara_files',
  (SELECT COUNT(*)::TEXT FROM kara_files), NULL::jsonb
UNION ALL
SELECT '10. Row Counts', 'Record Counts', 'kara_song_groups',
  (SELECT COUNT(*)::TEXT FROM kara_song_groups), NULL::jsonb
UNION ALL
SELECT '10. Row Counts', 'Record Counts', 'kara_song_group_members',
  (SELECT COUNT(*)::TEXT FROM kara_song_group_members), NULL::jsonb
UNION ALL
SELECT '10. Row Counts', 'Record Counts', 'kara_artists',
  (SELECT COUNT(*)::TEXT FROM kara_artists), NULL::jsonb
UNION ALL
SELECT '10. Row Counts', 'Record Counts', 'kara_users',
  (SELECT COUNT(*)::TEXT FROM kara_users), NULL::jsonb
UNION ALL
SELECT '10. Row Counts', 'Record Counts', 'kara_rooms',
  (SELECT COUNT(*)::TEXT FROM kara_rooms), NULL::jsonb
UNION ALL
SELECT '10. Row Counts', 'Record Counts', 'kara_queue',
  (SELECT COUNT(*)::TEXT FROM kara_queue), NULL::jsonb
UNION ALL
SELECT '10. Row Counts', 'Record Counts', 'kara_song_history',
  (SELECT COUNT(*)::TEXT FROM kara_song_history), NULL::jsonb
UNION ALL
SELECT '10. Row Counts', 'Record Counts', 'kara_user_preferences',
  (SELECT COUNT(*)::TEXT FROM kara_user_preferences), NULL::jsonb;

-- ============================================
-- FINAL OUTPUT: ALL ANALYSIS RESULTS
-- ============================================
SELECT 
  section,
  subsection,
  key,
  value,
  CASE 
    WHEN details IS NOT NULL THEN jsonb_pretty(details)
    ELSE NULL
  END as details_json
FROM analysis_results
ORDER BY section, subsection, key;
