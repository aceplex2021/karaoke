-- ============================================
-- INVESTIGATE ORPHANED SONGS
-- ============================================
-- Date: 2026-01-17
-- Issue: 67 songs in kara_songs not linked to any group
-- Impact: These songs won't appear in search results
-- 
-- This script helps you understand which songs are orphaned
-- and decide what to do with them
-- ============================================

-- ============================================
-- STEP 1: FIND ALL ORPHANED SONGS
-- ============================================

-- List orphaned songs with details
SELECT 
  s.id,
  s.title,
  s.artist_id,
  s.created_at,
  s.base_title_unaccent,
  s.is_active,
  -- Check if they have versions
  (SELECT COUNT(*) FROM kara_versions v WHERE v.song_id = s.id) as version_count,
  -- Check if they have files
  (SELECT COUNT(*) FROM kara_versions v 
   JOIN kara_files f ON v.id = f.version_id 
   WHERE v.song_id = s.id) as file_count,
  -- Check if they're in queue
  (SELECT COUNT(*) FROM kara_queue q WHERE q.song_id = s.id) as in_queue_count,
  -- Check if they're in history
  (SELECT COUNT(*) FROM kara_song_history h WHERE h.song_id = s.id) as in_history_count
FROM kara_songs s
LEFT JOIN kara_song_group_members m ON s.id = m.song_id
WHERE m.song_id IS NULL
ORDER BY s.created_at DESC;

-- ============================================
-- STEP 2: CATEGORIZE ORPHANED SONGS
-- ============================================

-- Summary by category
SELECT 
  CASE 
    WHEN version_count = 0 THEN 'No versions (safe to delete)'
    WHEN file_count = 0 THEN 'Has versions but no files (safe to delete)'
    WHEN in_queue_count > 0 OR in_history_count > 0 THEN 'In use (MUST keep - add to group)'
    WHEN is_active = false THEN 'Inactive (safe to delete)'
    ELSE 'Active with files (should add to group)'
  END as category,
  COUNT(*) as song_count
FROM (
  SELECT 
    s.id,
    s.is_active,
    (SELECT COUNT(*) FROM kara_versions v WHERE v.song_id = s.id) as version_count,
    (SELECT COUNT(*) FROM kara_versions v 
     JOIN kara_files f ON v.id = f.version_id 
     WHERE v.song_id = s.id) as file_count,
    (SELECT COUNT(*) FROM kara_queue q WHERE q.song_id = s.id) as in_queue_count,
    (SELECT COUNT(*) FROM kara_song_history h WHERE h.song_id = s.id) as in_history_count
  FROM kara_songs s
  LEFT JOIN kara_song_group_members m ON s.id = m.song_id
  WHERE m.song_id IS NULL
) orphans
GROUP BY category
ORDER BY song_count DESC;

-- ============================================
-- STEP 3: FIND MATCHING GROUPS FOR ORPHANS
-- ============================================

-- Try to match orphaned songs to existing groups by title
SELECT 
  s.id as orphan_song_id,
  s.title as orphan_title,
  s.base_title_unaccent as orphan_base_title,
  g.id as matching_group_id,
  g.base_title_unaccent as group_title,
  g.base_title_display as group_display,
  -- How many songs already in this group?
  (SELECT COUNT(*) FROM kara_song_group_members m WHERE m.group_id = g.id) as songs_in_group,
  -- Similarity score (lower is better)
  levenshtein(s.base_title_unaccent, g.base_title_unaccent) as title_distance
FROM kara_songs s
LEFT JOIN kara_song_group_members m ON s.id = m.song_id
CROSS JOIN kara_song_groups g
WHERE m.song_id IS NULL
  AND s.base_title_unaccent IS NOT NULL
  AND g.base_title_unaccent IS NOT NULL
  -- Only show close matches
  AND levenshtein(s.base_title_unaccent, g.base_title_unaccent) < 5
ORDER BY s.title, title_distance
LIMIT 50;

-- Note: If levenshtein function is not available, you'll need to install pg_trgm extension:
-- CREATE EXTENSION IF NOT EXISTS pg_trgm;
-- Or use simpler matching:

-- Alternative: Simple exact match by base_title
SELECT 
  s.id as orphan_song_id,
  s.title as orphan_title,
  s.base_title_unaccent,
  g.id as matching_group_id,
  g.base_title_display,
  (SELECT COUNT(*) FROM kara_song_group_members m WHERE m.group_id = g.id) as songs_in_group
FROM kara_songs s
LEFT JOIN kara_song_group_members m ON s.id = m.song_id
JOIN kara_song_groups g ON LOWER(s.base_title_unaccent) = LOWER(g.base_title_unaccent)
WHERE m.song_id IS NULL
ORDER BY s.title;

-- ============================================
-- STEP 4: RECOMMENDATIONS
-- ============================================

SELECT 
  'RECOMMENDATIONS' as section,
  CASE 
    WHEN category = 'No versions (safe to delete)' THEN 'DELETE - No versions exist'
    WHEN category = 'Has versions but no files (safe to delete)' THEN 'DELETE - No media files'
    WHEN category = 'Inactive (safe to delete)' THEN 'DELETE - Marked inactive'
    WHEN category = 'In use (MUST keep - add to group)' THEN 'ADD TO GROUP - Song is being used'
    WHEN category = 'Active with files (should add to group)' THEN 'ADD TO GROUP - Has media files'
    ELSE 'REVIEW MANUALLY'
  END as action,
  COUNT(*) as count
FROM (
  SELECT 
    CASE 
      WHEN version_count = 0 THEN 'No versions (safe to delete)'
      WHEN file_count = 0 THEN 'Has versions but no files (safe to delete)'
      WHEN in_queue_count > 0 OR in_history_count > 0 THEN 'In use (MUST keep - add to group)'
      WHEN is_active = false THEN 'Inactive (safe to delete)'
      ELSE 'Active with files (should add to group)'
    END as category
  FROM (
    SELECT 
      s.id,
      s.is_active,
      (SELECT COUNT(*) FROM kara_versions v WHERE v.song_id = s.id) as version_count,
      (SELECT COUNT(*) FROM kara_versions v 
       JOIN kara_files f ON v.id = f.version_id 
       WHERE v.song_id = s.id) as file_count,
      (SELECT COUNT(*) FROM kara_queue q WHERE q.song_id = s.id) as in_queue_count,
      (SELECT COUNT(*) FROM kara_song_history h WHERE h.song_id = s.id) as in_history_count
    FROM kara_songs s
    LEFT JOIN kara_song_group_members m ON s.id = m.song_id
    WHERE m.song_id IS NULL
  ) orphans
) categorized
GROUP BY category, action
ORDER BY count DESC;
