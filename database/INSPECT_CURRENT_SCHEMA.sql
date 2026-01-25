-- ============================================
-- INSPECT CURRENT DATABASE SCHEMA
-- ============================================
-- Run this in Supabase SQL Editor to get complete schema info
-- Date: 2026-01-24
-- ============================================

-- ============================================
-- 1. List all kara_* tables with column counts
-- ============================================
SELECT 
  table_name,
  (SELECT COUNT(*) FROM information_schema.columns 
   WHERE table_name = t.table_name AND table_schema = 'public') as column_count
FROM information_schema.tables t
WHERE table_schema = 'public' 
  AND table_name LIKE 'kara_%'
  AND table_type = 'BASE TABLE'
ORDER BY table_name;

-- ============================================
-- 2. Get detailed column info for ALL kara_* tables
-- ============================================
SELECT 
  table_name,
  column_name,
  data_type,
  character_maximum_length,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name LIKE 'kara_%'
ORDER BY table_name, ordinal_position;

-- ============================================
-- 3. Get all indexes on kara_* tables
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
-- 4. Get all constraints (PRIMARY KEY, FOREIGN KEY, CHECK, UNIQUE)
-- ============================================
SELECT
  tc.table_name,
  tc.constraint_name,
  tc.constraint_type,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints tc
LEFT JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
LEFT JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
WHERE tc.table_schema = 'public'
  AND tc.table_name LIKE 'kara_%'
ORDER BY tc.table_name, tc.constraint_type, tc.constraint_name;

-- ============================================
-- 5. Get CHECK constraints details
-- ============================================
SELECT 
  tc.table_name,
  tc.constraint_name,
  cc.check_clause
FROM information_schema.table_constraints tc
JOIN information_schema.check_constraints cc
  ON tc.constraint_name = cc.constraint_name
WHERE tc.table_schema = 'public'
  AND tc.table_name LIKE 'kara_%'
  AND tc.constraint_type = 'CHECK'
ORDER BY tc.table_name, tc.constraint_name;

-- ============================================
-- 6. Get all PostgreSQL functions
-- ============================================
SELECT 
  routine_name,
  routine_type,
  data_type as return_type
FROM information_schema.routines 
WHERE routine_schema = 'public'
  AND (routine_name LIKE '%kara%' 
       OR routine_name IN ('advance_playback', 'host_reorder_queue', 'user_reorder_queue'))
ORDER BY routine_name;

-- ============================================
-- 7. Get row counts for each table
-- ============================================
SELECT 
  'kara_users' as table_name, COUNT(*) as row_count FROM kara_users
UNION ALL
SELECT 'kara_rooms', COUNT(*) FROM kara_rooms
UNION ALL
SELECT 'kara_queue', COUNT(*) FROM kara_queue
UNION ALL
SELECT 'kara_room_participants', COUNT(*) FROM kara_room_participants
UNION ALL
SELECT 'kara_song_history', COUNT(*) FROM kara_song_history
UNION ALL
SELECT 'kara_user_preferences', COUNT(*) FROM kara_user_preferences
UNION ALL
SELECT 'kara_versions', COUNT(*) FROM kara_versions
UNION ALL
SELECT 'kara_files', COUNT(*) FROM kara_files
UNION ALL
SELECT 'kara_song_groups', COUNT(*) FROM kara_song_groups
UNION ALL
SELECT 'kara_languages', COUNT(*) FROM kara_languages
ORDER BY table_name;

-- ============================================
-- 8. COMPACT VIEW - All tables with columns in one query
-- ============================================
SELECT 
  c.table_name,
  c.ordinal_position,
  c.column_name,
  c.data_type || 
    CASE 
      WHEN c.character_maximum_length IS NOT NULL 
      THEN '(' || c.character_maximum_length || ')'
      WHEN c.data_type = 'ARRAY' THEN '[]'
      ELSE ''
    END as data_type_full,
  CASE WHEN c.is_nullable = 'YES' THEN 'NULL' ELSE 'NOT NULL' END as nullable,
  COALESCE(c.column_default, '') as default_value
FROM information_schema.columns c
WHERE c.table_schema = 'public'
  AND c.table_name LIKE 'kara_%'
ORDER BY c.table_name, c.ordinal_position;
