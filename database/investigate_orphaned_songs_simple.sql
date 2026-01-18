-- ============================================
-- INVESTIGATE ORPHANED SONGS (SIMPLIFIED)
-- ============================================
-- Date: 2026-01-17
-- Issue: 67 songs in kara_songs not linked to any group
-- Impact: These songs won't appear in search results
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
-- STEP 3: FIND MATCHING GROUPS (EXACT MATCH)
-- ============================================

-- Match orphaned songs to existing groups by exact base_title
SELECT 
  s.id as orphan_song_id,
  s.title as orphan_title,
  s.base_title_unaccent as orphan_base_title,
  g.id as matching_group_id,
  g.base_title_display as group_display,
  (SELECT COUNT(*) FROM kara_song_group_members m WHERE m.group_id = g.id) as songs_in_group
FROM kara_songs s
LEFT JOIN kara_song_group_members m ON s.id = m.song_id
JOIN kara_song_groups g ON LOWER(TRIM(s.base_title_unaccent)) = LOWER(TRIM(g.base_title_unaccent))
WHERE m.song_id IS NULL
  AND s.base_title_unaccent IS NOT NULL
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
