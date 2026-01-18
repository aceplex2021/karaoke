-- ============================================
-- CLEAN SONG GROUP DISPLAY TITLES
-- ============================================
-- Applies same cleanup to kara_song_groups.base_title_display
-- that we applied to kara_songs.title
-- Date: January 17, 2026
-- ============================================

BEGIN;

-- Use the same clean_song_title function we created earlier
-- Update group display titles
UPDATE kara_song_groups
SET base_title_display = clean_song_title(base_title_display);

-- Show statistics
SELECT 
  '=== GROUP TITLE CLEANUP STATISTICS ===' as section,
  'Total groups' as metric,
  COUNT(*) as count
FROM kara_song_groups
UNION ALL
SELECT 
  '',
  'Display titles updated',
  COUNT(*)
FROM kara_song_groups
WHERE base_title_display IS NOT NULL;

-- Sample of cleaned titles
SELECT 
  '=== SAMPLE CLEANED GROUP TITLES ===' as section,
  base_title_display,
  base_title_unaccent
FROM kara_song_groups
ORDER BY RANDOM()
LIMIT 20;

COMMIT;
