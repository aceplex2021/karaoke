-- ============================================
-- INVESTIGATE MESSY SONG TITLES
-- ============================================
-- Sample titles to identify cleanup patterns
-- ============================================

-- Sample random song titles from kara_songs
SELECT 
  'SONG TITLES (kara_songs)' as section,
  title,
  LENGTH(title) as title_length,
  base_title_unaccent
FROM kara_songs
ORDER BY RANDOM()
LIMIT 30;

-- Sample from search view
SELECT 
  'SEARCH VIEW TITLES (kara_song_versions_view)' as section,
  song_title,
  version_count
FROM kara_song_versions_view
ORDER BY RANDOM()
LIMIT 30;

-- Sample from detail view with metadata
SELECT 
  'DETAIL VIEW (kara_song_versions_detail_view)' as section,
  song_title,
  tone,
  mixer,
  style,
  artist,
  storage_path
FROM kara_song_versions_detail_view
ORDER BY RANDOM()
LIMIT 20;

-- Check for common problematic patterns
SELECT 
  'PATTERNS IN TITLES' as section,
  COUNT(*) as count,
  'Contains [brackets]' as pattern
FROM kara_songs
WHERE title LIKE '%[%]%'
UNION ALL
SELECT 
  'PATTERNS IN TITLES',
  COUNT(*),
  'Contains (parentheses)'
FROM kara_songs
WHERE title LIKE '%(%)'
UNION ALL
SELECT 
  'PATTERNS IN TITLES',
  COUNT(*),
  'Contains - dash'
FROM kara_songs
WHERE title LIKE '%-%'
UNION ALL
SELECT 
  'PATTERNS IN TITLES',
  COUNT(*),
  'All UPPERCASE words'
FROM kara_songs
WHERE title ~ '[A-Z]{3,}'
UNION ALL
SELECT 
  'PATTERNS IN TITLES',
  COUNT(*),
  'Contains numbers at end'
FROM kara_songs
WHERE title ~ '\d+$';
