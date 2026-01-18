-- ============================================
-- WORKING CLEANUP FUNCTION
-- ============================================
-- Uses split_part which correctly handles full-width pipes
-- Date: January 17, 2026
-- ============================================

BEGIN;

CREATE OR REPLACE FUNCTION clean_title_final(input_title TEXT)
RETURNS TEXT AS $$
DECLARE
  cleaned TEXT;
  pipe_pos INT;
BEGIN
  IF input_title IS NULL OR input_title = '' THEN
    RETURN input_title;
  END IF;
  
  cleaned := input_title;
  
  -- Remove everything after full-width pipe ｜
  pipe_pos := POSITION('｜' IN cleaned);
  IF pipe_pos > 0 THEN
    cleaned := SUBSTRING(cleaned FROM 1 FOR pipe_pos - 1);
  END IF;
  
  -- Remove everything after regular pipe |
  pipe_pos := POSITION('|' IN cleaned);
  IF pipe_pos > 0 THEN
    cleaned := SUBSTRING(cleaned FROM 1 FOR pipe_pos - 1);
  END IF;
  
  -- Remove leading full-width pipes
  cleaned := LTRIM(cleaned, '｜ ');
  
  -- Remove path fragments
  IF POSITION('/' IN cleaned) > 0 THEN
    cleaned := REGEXP_REPLACE(cleaned, '^.+/', '');
  END IF;
  
  -- Remove karaoke prefix
  cleaned := REGEXP_REPLACE(cleaned, '^karaoke\s+', '', 'i');
  
  -- Remove common noise words
  cleaned := REGEXP_REPLACE(cleaned, 'nhac\s+song', '', 'gi');
  cleaned := REGEXP_REPLACE(cleaned, 'nhạc\s+sống', '', 'gi');
  cleaned := REGEXP_REPLACE(cleaned, 'chat\s+luong\s+cao', '', 'gi');
  cleaned := REGEXP_REPLACE(cleaned, 'de\s+hat', '', 'gi');
  cleaned := REGEXP_REPLACE(cleaned, 'chuan', '', 'gi');
  cleaned := REGEXP_REPLACE(cleaned, 'chuẩn', '', 'gi');
  
  -- Clean up spaces and capitalize
  cleaned := REGEXP_REPLACE(cleaned, '\s{2,}', ' ', 'g');
  cleaned := TRIM(cleaned);
  cleaned := INITCAP(cleaned);
  
  -- Safety: don't return empty
  IF LENGTH(cleaned) < 3 THEN
    RETURN INITCAP(TRIM(input_title));
  END IF;
  
  RETURN cleaned;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Test
SELECT clean_title_final('｜ Khi Nao Chau Duong ｜ Chuan') as test1,
       clean_title_final('| Khi | Tran') as test2,
       clean_title_final('Vui Tet Nhac Song Trong Hieu') as test3;

COMMIT;
