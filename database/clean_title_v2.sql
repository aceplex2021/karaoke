-- ============================================
-- PROPER CLEANUP WITH FULL-WIDTH PIPE SUPPORT
-- ============================================
-- Handle both regular (|) and full-width (｜) pipes
-- Date: January 17, 2026
-- ============================================

BEGIN;

-- Create improved cleanup function
CREATE OR REPLACE FUNCTION clean_song_title_v2(input_title TEXT)
RETURNS TEXT AS $$
DECLARE
  cleaned TEXT;
BEGIN
  IF input_title IS NULL THEN
    RETURN NULL;
  END IF;
  
  cleaned := input_title;
  
  -- STEP 1: Remove everything after first pipe (both types)
  -- Full-width pipe ｜ (U+FF5C)
  IF POSITION('｜' IN cleaned) > 0 THEN
    cleaned := SUBSTRING(cleaned FROM 1 FOR POSITION('｜' IN cleaned) - 1);
  END IF;
  
  -- Regular pipe |
  IF POSITION('|' IN cleaned) > 0 THEN
    cleaned := SUBSTRING(cleaned FROM 1 FOR POSITION('|' IN cleaned) - 1);
  END IF;
  
  -- STEP 2: Remove path fragments (anything before last /)
  IF POSITION('/' IN cleaned) > 0 THEN
    cleaned := SUBSTRING(cleaned FROM '([^/]+)$');
  END IF;
  
  -- STEP 3: Remove "karaoke" prefix (case insensitive)
  cleaned := REGEXP_REPLACE(cleaned, '^karaoke\s+', '', 'i');
  
  -- STEP 4: Remove "Nhac Song" variations
  cleaned := REGEXP_REPLACE(cleaned, 'nhac\s+song', '', 'gi');
  cleaned := REGEXP_REPLACE(cleaned, 'nhạc\s+sống', '', 'gi');
  
  -- STEP 5: Remove quality descriptors
  cleaned := REGEXP_REPLACE(cleaned, 'chat\s+luong\s+cao', '', 'gi');
  cleaned := REGEXP_REPLACE(cleaned, 'chất\s+lượng\s+cao', '', 'gi');
  cleaned := REGEXP_REPLACE(cleaned, 'de\s+hat', '', 'gi');
  cleaned := REGEXP_REPLACE(cleaned, 'dễ\s+hát', '', 'gi');
  cleaned := REGEXP_REPLACE(cleaned, 'am\s+thanh\s+chuan', '', 'gi');
  cleaned := REGEXP_REPLACE(cleaned, 'âm\s+thanh\s+chuẩn', '', 'gi');
  cleaned := REGEXP_REPLACE(cleaned, 'beat\s+chuan', '', 'gi');
  cleaned := REGEXP_REPLACE(cleaned, 'beat\s+chuẩn', '', 'gi');
  
  -- STEP 6: Remove production terms at end
  cleaned := REGEXP_REPLACE(cleaned, '\s+(soprano|tenor|tone\s+nam|tone\s+nu|kim\s+quy)$', '', 'gi');
  cleaned := REGEXP_REPLACE(cleaned, '\s+(song\s+ca|bolero|rumba|ballad|remix)$', '', 'gi');
  
  -- STEP 7: Final cleanup
  cleaned := TRIM(cleaned);
  cleaned := REGEXP_REPLACE(cleaned, '\s{2,}', ' ', 'g');
  cleaned := INITCAP(cleaned);
  
  -- Safety check: don't return empty or very short titles
  IF LENGTH(TRIM(cleaned)) < 3 THEN
    RETURN INITCAP(TRIM(input_title));
  END IF;
  
  RETURN cleaned;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Test on problematic titles
SELECT 
  '=== TEST RESULTS ===' as section,
  input as original,
  clean_song_title_v2(input) as cleaned
FROM (VALUES
  ('｜ Khi Nao Chau Duong ｜ Chuan'),
  ('| Khi | Tran'),
  ('Incoming/ Legacy/karaoke Mua Chieu'),
  ('Vui Tet Miet Vuon Nhac Song')
) AS tests(input);

COMMIT;
