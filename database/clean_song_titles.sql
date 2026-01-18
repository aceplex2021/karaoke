-- ============================================
-- CLEAN SONG TITLES - REMOVE NOISE
-- ============================================
-- Removes metadata/noise from kara_songs.title
-- Updates both title and base_title_unaccent columns
-- 
-- Categories applied: 1-8, 10 (skipping 9 - artist extraction)
-- 
-- IMPORTANT: Run add_artist_name_column.sql first!
-- ============================================

BEGIN;

-- Create backup table
CREATE TABLE IF NOT EXISTS kara_songs_backup_20260117_title_cleanup AS
SELECT * FROM kara_songs;

-- Create function to clean titles
CREATE OR REPLACE FUNCTION clean_song_title(input_title TEXT) 
RETURNS TEXT AS $$
DECLARE
  cleaned TEXT;
BEGIN
  cleaned := input_title;
  
  -- Category 2: Remove path fragments (FIRST - before anything else)
  -- Remove everything up to last "/" 
  IF cleaned ~ '/' THEN
    cleaned := REGEXP_REPLACE(cleaned, '^.+/', '', 'g');
  END IF;
  
  -- Category 1: Remove pipe separators and everything after
  -- Remove from first ｜ to end
  cleaned := REGEXP_REPLACE(cleaned, '｜ .+$', '', 'g');
  cleaned := REGEXP_REPLACE(cleaned, '^｜ (.+?) ｜$', '\1', 'g'); -- Handle ｜ Title ｜
  cleaned := REGEXP_REPLACE(cleaned, '^｜ ', '', 'g'); -- Handle leading ｜
  cleaned := REGEXP_REPLACE(cleaned, ' ｜$', '', 'g'); -- Handle trailing ｜
  
  -- Category 10: Special characters (before other removals)
  -- Remove hashtags
  cleaned := REGEXP_REPLACE(cleaned, '#\w+', '', 'gi');
  -- Remove special symbols
  cleaned := REGEXP_REPLACE(cleaned, '[✦？]', '', 'g');
  -- Normalize multiple pipes to single
  cleaned := REGEXP_REPLACE(cleaned, '｜｜+', '｜', 'g');
  
  -- Category 8: Remove "karaoke" at start
  cleaned := REGEXP_REPLACE(cleaned, '^karaoke\s+', '', 'gi');
  
  -- Category 3: Remove "Nhac Song" / "Nhạc Sống"
  cleaned := REGEXP_REPLACE(cleaned, '\s*nhac song\s*', ' ', 'gi');
  cleaned := REGEXP_REPLACE(cleaned, '\s*nhạc sống\s*', ' ', 'gi');
  
  -- Category 5: Quality/style descriptors
  cleaned := REGEXP_REPLACE(cleaned, '\s*chat luong cao\s*', ' ', 'gi');
  cleaned := REGEXP_REPLACE(cleaned, '\s*chất lượng cao\s*', ' ', 'gi');
  cleaned := REGEXP_REPLACE(cleaned, '\s*de hat\s*', ' ', 'gi');
  cleaned := REGEXP_REPLACE(cleaned, '\s*dễ hát\s*', ' ', 'gi');
  cleaned := REGEXP_REPLACE(cleaned, '\s*moi de hat\s*', ' ', 'gi');
  cleaned := REGEXP_REPLACE(cleaned, '\s*mới dễ hát\s*', ' ', 'gi');
  cleaned := REGEXP_REPLACE(cleaned, '\s*am thanh chuan\s*', ' ', 'gi');
  cleaned := REGEXP_REPLACE(cleaned, '\s*âm thanh chuẩn\s*', ' ', 'gi');
  cleaned := REGEXP_REPLACE(cleaned, '\s*beat chuan\s*', ' ', 'gi');
  cleaned := REGEXP_REPLACE(cleaned, '\s*beat chuẩn\s*', ' ', 'gi');
  cleaned := REGEXP_REPLACE(cleaned, '\s*ca si giau mat\s*', ' ', 'gi');
  cleaned := REGEXP_REPLACE(cleaned, '\s*ca sĩ giấu mặt\s*', ' ', 'gi');
  cleaned := REGEXP_REPLACE(cleaned, '\s*\b(hd|4k)\b\s*', ' ', 'gi');
  cleaned := REGEXP_REPLACE(cleaned, '\s*\bchuan\b\s*', ' ', 'gi');
  cleaned := REGEXP_REPLACE(cleaned, '\s*\bchuẩn\b\s*', ' ', 'gi');
  
  -- Category 4: Tone indicators (at end)
  cleaned := REGEXP_REPLACE(cleaned, '\s+(soprano|tenor)\s*$', '', 'gi');
  cleaned := REGEXP_REPLACE(cleaned, '\s+tone\s+(nam|nu|nữ)\s*$', '', 'gi');
  cleaned := REGEXP_REPLACE(cleaned, '\s+kim\s+quy\s*$', '', 'gi');
  cleaned := REGEXP_REPLACE(cleaned, '\s+sopranokimquy\s*$', '', 'gi');
  
  -- Category 6: Song type descriptors (at end)
  cleaned := REGEXP_REPLACE(cleaned, '\s+(song ca|lien khuc|liên khúc)\s*$', '', 'gi');
  cleaned := REGEXP_REPLACE(cleaned, '\s+(bolero|rumba|ballad)\s*$', '', 'gi');
  cleaned := REGEXP_REPLACE(cleaned, '\s+cha cha cha\s*$', '', 'gi');
  cleaned := REGEXP_REPLACE(cleaned, '\s+(slow|slowrock|slow rock)\s*$', '', 'gi');
  cleaned := REGEXP_REPLACE(cleaned, '\s+(bossa nova|bossanova)\s*$', '', 'gi');
  
  -- Category 7: Production credits
  cleaned := REGEXP_REPLACE(cleaned, '\s*\(feat\.[^)]+\)\s*', ' ', 'gi');
  cleaned := REGEXP_REPLACE(cleaned, '\s*\(karaoke version\)\s*', ' ', 'gi');
  cleaned := REGEXP_REPLACE(cleaned, '\s*\(backing track[^)]*\)\s*', ' ', 'gi');
  cleaned := REGEXP_REPLACE(cleaned, '\s*official\s*', ' ', 'gi');
  cleaned := REGEXP_REPLACE(cleaned, '\s*music box\s*', ' ', 'gi');
  cleaned := REGEXP_REPLACE(cleaned, '\s+ktv\s*', ' ', 'gi');
  cleaned := REGEXP_REPLACE(cleaned, '\s*productions\s*', ' ', 'gi');
  
  -- Final cleanup
  -- Remove leading/trailing whitespace
  cleaned := TRIM(cleaned);
  -- Remove leading/trailing dashes/pipes
  cleaned := REGEXP_REPLACE(cleaned, '^[-–｜\s]+', '');
  cleaned := REGEXP_REPLACE(cleaned, '[-–｜\s]+$', '');
  -- Collapse multiple spaces
  cleaned := REGEXP_REPLACE(cleaned, '\s{2,}', ' ', 'g');
  -- Title case (capitalize first letter of each word)
  cleaned := INITCAP(cleaned);
  
  -- If result is empty or too short, return original title
  IF LENGTH(TRIM(cleaned)) < 3 THEN
    cleaned := input_title;
  END IF;
  
  RETURN cleaned;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Show preview of changes (first 30 songs)
SELECT 
  'PREVIEW' as section,
  id,
  title as original_title,
  clean_song_title(title) as cleaned_title,
  LENGTH(title) - LENGTH(clean_song_title(title)) as chars_removed
FROM kara_songs
WHERE title != clean_song_title(title)
ORDER BY LENGTH(title) - LENGTH(clean_song_title(title)) DESC
LIMIT 30;

-- Show statistics
SELECT 
  'STATISTICS' as section,
  COUNT(*) as total_songs,
  COUNT(CASE WHEN title != clean_song_title(title) THEN 1 END) as songs_to_clean,
  ROUND(COUNT(CASE WHEN title != clean_song_title(title) THEN 1 END)::numeric / COUNT(*)::numeric * 100, 2) as percent_to_clean,
  AVG(LENGTH(title) - LENGTH(clean_song_title(title))) as avg_chars_removed
FROM kara_songs;

-- IMPORTANT: Review the preview above before proceeding!
-- If everything looks good, uncomment and run the UPDATE below:

-- Apply cleanup to title
UPDATE kara_songs
SET title = clean_song_title(title)
WHERE title != clean_song_title(title);

-- Apply cleanup to base_title_unaccent (with unaccent)
UPDATE kara_songs
SET base_title_unaccent = LOWER(UNACCENT(clean_song_title(title)))
WHERE title != clean_song_title(title) OR base_title_unaccent IS NULL;

-- Show final results
SELECT 
  'FINAL RESULTS' as section,
  COUNT(*) as total_songs_updated,
  AVG(LENGTH(title)) as avg_title_length
FROM kara_songs_backup_20260117_title_cleanup b
WHERE EXISTS (
  SELECT 1 FROM kara_songs s 
  WHERE s.id = b.id AND s.title != b.title
);

-- Sample cleaned titles
SELECT 
  'SAMPLE CLEANED TITLES' as section,
  b.title as original,
  s.title as cleaned,
  LENGTH(b.title) - LENGTH(s.title) as saved
FROM kara_songs_backup_20260117_title_cleanup b
JOIN kara_songs s ON s.id = b.id
WHERE b.title != s.title
ORDER BY RANDOM()
LIMIT 20;

COMMIT;

-- Drop the cleanup function (keep it commented if you want to reuse)
-- DROP FUNCTION IF EXISTS clean_song_title(TEXT);
