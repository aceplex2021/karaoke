-- ============================================
-- FIND TEST SONGS FROM UPDATED PATHS
-- ============================================
-- This shows sample songs from the 2,373 files that were updated
-- Use these to test search in the webapp
-- ============================================

-- Get 10 sample updated files with their old and new paths
SELECT 
  b.storage_path as old_path,
  f.storage_path as new_path,
  -- Extract song title for easier searching
  REGEXP_REPLACE(b.storage_path, '\.(mp4|mkv|avi|mov|wmv)$', '') as song_title_to_search
FROM kara_files f
JOIN kara_files_backup_20260117_path_fix b ON f.id = b.id
WHERE f.storage_path != b.storage_path
ORDER BY b.storage_path
LIMIT 10;

-- Get specific easy-to-search songs
SELECT 
  'EASY TEST SONGS' as category,
  b.storage_path as original_filename,
  -- Try to extract clean song title
  CASE 
    WHEN b.storage_path ILIKE '%karaoke%' THEN
      TRIM(REGEXP_REPLACE(
        REGEXP_REPLACE(b.storage_path, '.*KARAOKE.*?｜\s*', ''),
        '\s*-.*\.(mp4|mkv).*', ''
      ))
    ELSE
      TRIM(REGEXP_REPLACE(b.storage_path, '\.(mp4|mkv|avi).*', ''))
  END as search_term
FROM kara_files f
JOIN kara_files_backup_20260117_path_fix b ON f.id = b.id
WHERE f.storage_path != b.storage_path
  AND (
    -- Look for Vietnamese songs (easier to identify)
    b.storage_path ILIKE '%karaoke%tone%nam%'
    OR b.storage_path ILIKE '%nhạc%sống%'
  )
LIMIT 10;
