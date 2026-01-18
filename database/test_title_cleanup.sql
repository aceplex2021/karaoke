-- ============================================
-- TEST TITLE CLEANUP - PREVIEW ONLY
-- ============================================
-- Shows before/after for sample songs
-- Safe to run - makes NO changes to database
-- ============================================

-- Create the cleanup function (temporary)
CREATE OR REPLACE FUNCTION clean_song_title_preview(input_title TEXT) 
RETURNS TEXT AS $$
DECLARE
  cleaned TEXT;
BEGIN
  cleaned := input_title;
  
  -- Category 2: Remove path fragments
  IF cleaned ~ '/' THEN
    cleaned := REGEXP_REPLACE(cleaned, '^.+/', '', 'g');
  END IF;
  
  -- Category 1: Remove pipe separators
  cleaned := REGEXP_REPLACE(cleaned, '｜.+$', '', 'g');
  cleaned := REGEXP_REPLACE(cleaned, '^｜ (.+?) ｜$', '\1', 'g');
  cleaned := REGEXP_REPLACE(cleaned, '^｜ ', '', 'g');
  cleaned := REGEXP_REPLACE(cleaned, ' ｜$', '', 'g');
  
  -- Category 10: Special characters
  cleaned := REGEXP_REPLACE(cleaned, '#\w+', '', 'gi');
  cleaned := REGEXP_REPLACE(cleaned, '[✦？]', '', 'g');
  cleaned := REGEXP_REPLACE(cleaned, '｜｜+', '｜', 'g');
  
  -- Category 8: Remove "karaoke"
  cleaned := REGEXP_REPLACE(cleaned, '^karaoke\s+', '', 'gi');
  
  -- Category 3: Remove "Nhac Song"
  cleaned := REGEXP_REPLACE(cleaned, '\s*nhac song\s*', ' ', 'gi');
  cleaned := REGEXP_REPLACE(cleaned, '\s*nhạc sống\s*', ' ', 'gi');
  
  -- Category 5: Quality descriptors
  cleaned := REGEXP_REPLACE(cleaned, '\s*chat luong cao\s*', ' ', 'gi');
  cleaned := REGEXP_REPLACE(cleaned, '\s*chất lượng cao\s*', ' ', 'gi');
  cleaned := REGEXP_REPLACE(cleaned, '\s*de hat\s*', ' ', 'gi');
  cleaned := REGEXP_REPLACE(cleaned, '\s*dễ hát\s*', ' ', 'gi');
  cleaned := REGEXP_REPLACE(cleaned, '\s*moi de hat\s*', ' ', 'gi');
  cleaned := REGEXP_REPLACE(cleaned, '\s*am thanh chuan\s*', ' ', 'gi');
  cleaned := REGEXP_REPLACE(cleaned, '\s*âm thanh chuẩn\s*', ' ', 'gi');
  cleaned := REGEXP_REPLACE(cleaned, '\s*beat chuan\s*', ' ', 'gi');
  cleaned := REGEXP_REPLACE(cleaned, '\s*ca si giau mat\s*', ' ', 'gi');
  cleaned := REGEXP_REPLACE(cleaned, '\s*\b(hd|4k)\b\s*', ' ', 'gi');
  cleaned := REGEXP_REPLACE(cleaned, '\s*\bchuan\b\s*', ' ', 'gi');
  
  -- Category 4: Tone indicators
  cleaned := REGEXP_REPLACE(cleaned, '\s+(soprano|tenor)\s*$', '', 'gi');
  cleaned := REGEXP_REPLACE(cleaned, '\s+tone\s+(nam|nu|nữ)\s*$', '', 'gi');
  cleaned := REGEXP_REPLACE(cleaned, '\s+kim\s+quy\s*$', '', 'gi');
  
  -- Category 6: Song types
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
  cleaned := TRIM(cleaned);
  cleaned := REGEXP_REPLACE(cleaned, '^[-–｜\s]+', '');
  cleaned := REGEXP_REPLACE(cleaned, '[-–｜\s]+$', '');
  cleaned := REGEXP_REPLACE(cleaned, '\s{2,}', ' ', 'g');
  cleaned := INITCAP(cleaned);
  
  RETURN cleaned;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Test specific problem patterns
SELECT 
  '=== CATEGORY 1: PIPE SEPARATORS ===' as test_case,
  'Original' as type,
  'Canh Thiep Dau Xuan Nhac Song ｜ Trong Hieu' as example
UNION ALL
SELECT '', 'Cleaned', clean_song_title_preview('Canh Thiep Dau Xuan Nhac Song ｜ Trong Hieu')
UNION ALL
SELECT '', '', ''
UNION ALL
SELECT '=== CATEGORY 2: PATH FRAGMENTS ===', 'Original', 'Incoming/ Legacy/acv Videos/karaoke ｜ Em Chi So Ngay Mai'
UNION ALL
SELECT '', 'Cleaned', clean_song_title_preview('Incoming/ Legacy/acv Videos/karaoke ｜ Em Chi So Ngay Mai')
UNION ALL
SELECT '', '', ''
UNION ALL
SELECT '=== CATEGORY 3: NHAC SONG ===', 'Original', 'Vui Tet Miet Vuon Nhac Song ｜ Trong Hieu'
UNION ALL
SELECT '', 'Cleaned', clean_song_title_preview('Vui Tet Miet Vuon Nhac Song ｜ Trong Hieu')
UNION ALL
SELECT '', '', ''
UNION ALL
SELECT '=== CATEGORY 4: TONE INDICATORS ===', 'Original', 'Em Ve Mua Thu Soprano'
UNION ALL
SELECT '', 'Cleaned', clean_song_title_preview('Em Ve Mua Thu Soprano')
UNION ALL
SELECT '', '', ''
UNION ALL
SELECT '=== CATEGORY 5: QUALITY DESCRIPTORS ===', 'Original', 'Linh Hon Tuong Da Nhac Song Chat Luong Cao ｜ Trong Hieu'
UNION ALL
SELECT '', 'Cleaned', clean_song_title_preview('Linh Hon Tuong Da Nhac Song Chat Luong Cao ｜ Trong Hieu')
UNION ALL
SELECT '', '', ''
UNION ALL
SELECT '=== ENGLISH SONGS (NO CHANGE) ===', 'Original', 'Kelly Clarkson White Christmas'
UNION ALL
SELECT '', 'Cleaned', clean_song_title_preview('Kelly Clarkson White Christmas');

-- Real data preview - worst offenders
SELECT 
  '=== REAL DATA: LONGEST TITLES ===' as section,
  title as original,
  clean_song_title_preview(title) as cleaned,
  LENGTH(title) as orig_len,
  LENGTH(clean_song_title_preview(title)) as clean_len,
  LENGTH(title) - LENGTH(clean_song_title_preview(title)) as saved
FROM kara_songs
WHERE title != clean_song_title_preview(title)
ORDER BY LENGTH(title) DESC
LIMIT 10;

-- Random sample
SELECT 
  '=== RANDOM SAMPLE ===' as section,
  title as original,
  clean_song_title_preview(title) as cleaned,
  LENGTH(title) - LENGTH(clean_song_title_preview(title)) as saved
FROM kara_songs
WHERE title != clean_song_title_preview(title)
ORDER BY RANDOM()
LIMIT 20;

-- Statistics
SELECT 
  '=== STATISTICS ===' as metric,
  COUNT(*) as value,
  'Total songs' as description
FROM kara_songs
UNION ALL
SELECT 
  '',
  COUNT(CASE WHEN title != clean_song_title_preview(title) THEN 1 END),
  'Songs that will change'
FROM kara_songs
UNION ALL
SELECT 
  '',
  ROUND(COUNT(CASE WHEN title != clean_song_title_preview(title) THEN 1 END)::numeric / COUNT(*)::numeric * 100, 1),
  'Percent that will change'
FROM kara_songs
UNION ALL
SELECT 
  '',
  ROUND(AVG(LENGTH(title) - LENGTH(clean_song_title_preview(title))), 1),
  'Average characters removed'
FROM kara_songs
WHERE title != clean_song_title_preview(title);

-- Cleanup
DROP FUNCTION clean_song_title_preview(TEXT);
