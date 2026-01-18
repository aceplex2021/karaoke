-- ============================================
-- POPULATE ARTIST_NAME IN KARA_SONGS
-- ============================================
-- Uses the extract_artist_from_path() function
-- to populate kara_songs.artist_name from storage_path
-- Date: January 17, 2026
-- ============================================

BEGIN;

-- Update kara_songs with extracted artists
-- Join through kara_files -> kara_versions to get storage_path
UPDATE kara_songs s
SET artist_name = extract_artist_from_path(f.storage_path)
FROM kara_files f
JOIN kara_versions v ON f.version_id = v.id
WHERE s.id = v.song_id;

-- Show statistics
SELECT 
  '=== UPDATE STATISTICS ===' as section,
  'Total songs' as metric,
  COUNT(*) as count
FROM kara_songs
UNION ALL
SELECT 
  '',
  'Artist populated',
  COUNT(*)
FROM kara_songs
WHERE artist_name IS NOT NULL
UNION ALL
SELECT 
  '',
  'NULL (no artist)',
  COUNT(*)
FROM kara_songs
WHERE artist_name IS NULL;

-- Sample of populated artists
SELECT 
  '=== SAMPLE UPDATED SONGS ===' as section,
  title,
  artist_name,
  id
FROM kara_songs
WHERE artist_name IS NOT NULL
ORDER BY RANDOM()
LIMIT 20;

-- Top artists by song count
SELECT 
  '=== TOP ARTISTS ===' as section,
  artist_name,
  COUNT(*) as song_count
FROM kara_songs
WHERE artist_name IS NOT NULL
GROUP BY artist_name
ORDER BY COUNT(*) DESC
LIMIT 30;

COMMIT;
