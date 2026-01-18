-- Update kara_song_versions_view to include group_id
-- This rebuilds the view using base tables (like detail view) for consistency
-- Groups by group_id so each group gets its own row (no more combining groups)

DROP VIEW IF EXISTS kara_song_versions_view;

CREATE OR REPLACE VIEW kara_song_versions_view AS
SELECT
  g.id AS group_id,  -- ← ADD THIS: Group identifier for linking
  LOWER(COALESCE(g.base_title_display, g.base_title_unaccent)) AS song_title,
  COUNT(DISTINCT v.id) AS version_count
FROM kara_files f
INNER JOIN kara_versions v ON f.version_id = v.id
INNER JOIN kara_songs s ON v.song_id = s.id
INNER JOIN kara_song_group_members m ON s.id = m.song_id
INNER JOIN kara_song_groups g ON m.group_id = g.id
WHERE f.type = 'video'
  AND COALESCE(g.base_title_display, g.base_title_unaccent) IS NOT NULL  -- Exclude medleys
GROUP BY g.id, g.base_title_display, g.base_title_unaccent
ORDER BY song_title;

-- Verify the update
SELECT 
    'SEARCH_VIEW_VERIFICATION' as section,
    group_id,
    song_title,
    version_count
FROM kara_song_versions_view
WHERE song_title ILIKE '%dem dong%'
ORDER BY song_title;

-- Compare: Should now show 5 separate groups instead of 3 combined results
-- Expected results:
-- 1. "dem dong slow rock kim quy" (6 versions)
-- 2. "dem dong slow rock song ca kim quy" (1 version)
-- 3. "dem dong slow rock soprano kim quy" (1 version)
-- 4. "dem dong tenor" (2 versions) - group_id: d15da25b-444c-4398-bd4a-96af3bbc2524
-- 5. "dem dong vua ｜ tran" (1 version)
