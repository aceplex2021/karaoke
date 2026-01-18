-- ============================================
-- FIX CLEAN_SONG_TITLE FOR FULL-WIDTH PIPES
-- ============================================
-- The original function only handles regular pipes (|)
-- but data has full-width pipes (｜)
-- Date: January 17, 2026
-- ============================================

BEGIN;

-- Drop and recreate the function with full-width pipe support
DROP FUNCTION IF EXISTS clean_song_title(TEXT);

CREATE OR REPLACE FUNCTION clean_song_title(input_title TEXT)
RETURNS TEXT AS $$
DECLARE
  cleaned TEXT;
BEGIN
  cleaned := input_title;
  
  -- CRITICAL FIX: Remove FULL-WIDTH pipes (｜) and everything after
  -- This is Unicode character U+FF5C, not regular pipe (|)
  cleaned := REGEXP_REPLACE(cleaned, '｜.*$', '');
  cleaned := REGEXP_REPLACE(cleaned, '^｜+', '');
  
  -- Also handle regular pipes just in case
  cleaned := REGEXP_REPLACE(cleaned, '\|.*$', '');
  cleaned := REGEXP_REPLACE(cleaned, '^\|+', '');
  
  -- Remove path fragments
  cleaned := REGEXP_REPLACE(cleaned, '^.*/', '');
  
  -- Remove "karaoke" prefix (case insensitive)
  cleaned := REGEXP_REPLACE(cleaned, '^karaoke\s+', '', 'i');
  
  -- Remove "Nhac Song" / "Nhạc Sống" (case insensitive)
  cleaned := REGEXP_REPLACE(cleaned, '\s*nhac\s+song\s*', ' ', 'gi');
  cleaned := REGEXP_REPLACE(cleaned, '\s*nhạc\s+sống\s*', ' ', 'gi');
  
  -- Remove quality descriptors
  cleaned := REGEXP_REPLACE(cleaned, '\s*(chat\s+luong\s+cao|chất\s+lượng\s+cao)\s*', ' ', 'gi');
  cleaned := REGEXP_REPLACE(cleaned, '\s*(de\s+hat|dễ\s+hát|moi\s+de\s+hat|mới\s+dễ\s+hát)\s*', ' ', 'gi');
  cleaned := REGEXP_REPLACE(cleaned, '\s*(am\s+thanh\s+chuan|âm\s+thanh\s+chuẩn)\s*', ' ', 'gi');
  cleaned := REGEXP_REPLACE(cleaned, '\s*(beat\s+chuan|beat\s+chuẩn)\s*', ' ', 'gi');
  cleaned := REGEXP_REPLACE(cleaned, '\s*(ca\s+si\s+giau\s+mat|ca\s+sĩ\s+giấu\s+mặt)\s*', ' ', 'gi');
  cleaned := REGEXP_REPLACE(cleaned, '\s+(hd|4k|chuan|chuẩn)\s*', ' ', 'gi');
  
  -- Remove tone indicators at end
  cleaned := REGEXP_REPLACE(cleaned, '\s+(soprano|tenor|tone\s+nam|tone\s+nu|tone\s+nữ|kim\s+quy)\s*$', '', 'gi');
  
  -- Remove song type descriptors at end
  cleaned := REGEXP_REPLACE(cleaned, '\s+(song\s+ca|lien\s+khuc|liên\s+khúc|bolero|rumba|cha\s+cha\s+cha|slow|slowrock|slow\s+rock|ballad|bossa\s+nova|bossanova)\s*$', '', 'gi');
  
  -- Remove production credits
  cleaned := REGEXP_REPLACE(cleaned, '\s*\(?(karaoke\s+version|backing\s+track|official|music\s+box|ktv|productions)\)?', '', 'gi');
  cleaned := REGEXP_REPLACE(cleaned, '\s*\(feat\..*?\)', '', 'gi');
  
  -- Remove special characters and hashtags
  cleaned := REGEXP_REPLACE(cleaned, '#\w+', '', 'g');
  cleaned := REGEXP_REPLACE(cleaned, '[✦？]', '', 'g');
  
  -- Final cleanup
  cleaned := TRIM(cleaned);
  cleaned := REGEXP_REPLACE(cleaned, '^[-–｜\s]+', '');
  cleaned := REGEXP_REPLACE(cleaned, '[-–｜\s]+$', '');
  cleaned := REGEXP_REPLACE(cleaned, '\s{2,}', ' ', 'g');
  cleaned := INITCAP(cleaned);
  
  -- If result is empty or too short, return original title
  IF LENGTH(TRIM(cleaned)) < 3 THEN
    cleaned := input_title;
  END IF;
  
  RETURN cleaned;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Test the fix
SELECT 
  '=== TEST FULL-WIDTH PIPE CLEANUP ===' as section,
  '｜ Khi Nao Chau Duong ｜ Chuan' as original,
  clean_song_title('｜ Khi Nao Chau Duong ｜ Chuan') as cleaned;

COMMIT;
