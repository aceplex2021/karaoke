-- Add group_id to both views for proper linking
-- This allows us to match search results to version details unambiguously

-- ============================================================================
-- STEP 1: Update kara_song_versions_detail_view to include group_id
-- ============================================================================
-- This view already has access to group_id through the join to kara_song_groups
DROP VIEW IF EXISTS kara_song_versions_detail_view;

CREATE OR REPLACE VIEW kara_song_versions_detail_view AS
SELECT
  f.id,  -- This is kara_files.id (file_id)
  f.version_id,  -- This is kara_versions.id (needed for queue)
  g.id AS group_id,  -- ← ADD THIS: Group identifier for linking
  -- Use group's title (same as kara_song_versions_view) for consistency
  -- Apply LOWER to match search view format (search view returns lowercase)
  LOWER(COALESCE(g.base_title_display, g.base_title_unaccent)) AS song_title,
  f.storage_path,
  
  -- Extract tone inline (same logic as kara_files_parsed_preview, but inline)
  CASE
    WHEN f.storage_path ~* 'tone\s*nữ|__nu' THEN 'Nữ'
    WHEN f.storage_path ~* 'tone\s*nam|__nam' THEN 'Nam'
    WHEN f.storage_path ~* 'song\s*ca|__song_ca' THEN 'Song ca'
    ELSE NULL
  END AS tone,
  
  -- Extract mixer inline
  CASE
    WHEN f.storage_path ~* 'kim\s*quy' THEN 'Kim Quy'
    WHEN f.storage_path ~* 'hiếu\s*organ|hieu\s*organ' THEN 'Hiếu Organ'
    WHEN f.storage_path ~* 'hiếu|hieu' THEN 'Hiếu Organ'
    WHEN f.storage_path ~* 'trọng\s*hiếu|trong\s*hieu' THEN 'Trọng Hiếu'
    WHEN f.storage_path ~* 'yêu\s*ca\s*hát|yeu\s*ca\s*hat|love\s*singing' THEN 'Yêu Ca Hát'
    ELSE NULL
  END AS mixer,
  
  -- Extract style inline
  CASE
    WHEN f.storage_path ~* 'slow|ballad' THEN 'Ballad'
    WHEN f.storage_path ~* 'bolero' THEN 'Bolero'
    WHEN f.storage_path ~* 'remix' THEN 'Remix'
    WHEN f.storage_path ~* 'nhạc\s*sống|nhac\s*song|nhacsong' THEN 'Nhạc sống'
    ELSE NULL
  END AS style,
  
  -- Extract artist inline (text inside first parentheses)
  NULLIF(
    trim((regexp_match(f.storage_path, '\(([^)]+)\)'))[1]),
    ''
  ) AS artist,
  
  f.created_at
FROM kara_files f
INNER JOIN kara_versions v ON f.version_id = v.id
INNER JOIN kara_songs s ON v.song_id = s.id
INNER JOIN kara_song_group_members m ON s.id = m.song_id
INNER JOIN kara_song_groups g ON m.group_id = g.id
WHERE f.type = 'video';

-- ============================================================================
-- STEP 2: Update kara_song_versions_view to include group_id
-- ============================================================================
-- NOTE: We need to see the actual definition of kara_song_versions_view first
-- This is a placeholder - you'll need to modify the actual view definition
-- to include group_id in the SELECT and GROUP BY clauses

-- First, let's see what the current view looks like
-- Run this to get the definition:
-- SELECT definition FROM pg_views WHERE viewname = 'kara_song_versions_view';

-- Then modify it to include group_id. The view likely does something like:
-- SELECT song_title, COUNT(*) as version_count
-- FROM ... 
-- GROUP BY song_title
--
-- Change it to:
-- SELECT group_id, song_title, COUNT(*) as version_count
-- FROM ...
-- GROUP BY group_id, song_title

-- ============================================================================
-- STEP 3: Verify the changes
-- ============================================================================
-- Check that group_id is now available in detail view
SELECT 
    'DETAIL_VIEW_VERIFICATION' as section,
    column_name,
    data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'kara_song_versions_detail_view'
  AND column_name = 'group_id';

-- Test query: Get versions for a specific group
SELECT 
    'TEST_GROUP_QUERY' as section,
    group_id,
    song_title,
    COUNT(*) as file_count,
    COUNT(DISTINCT version_id) as version_count
FROM kara_song_versions_detail_view
WHERE group_id = 'd15da25b-444c-4398-bd4a-96af3bbc2524'  -- "dem dong tenor" group
GROUP BY group_id, song_title;
