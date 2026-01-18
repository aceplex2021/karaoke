-- ============================================
-- DIRECT DATABASE CLEANUP - NO FUNCTION
-- ============================================
-- Apply cleanup directly to both tables
-- Date: January 17, 2026
-- ============================================

BEGIN;

-- Clean kara_songs.title
UPDATE kara_songs
SET title = 
  INITCAP(TRIM(
    REGEXP_REPLACE(
      REGEXP_REPLACE(
        REGEXP_REPLACE(
          REGEXP_REPLACE(
            REGEXP_REPLACE(
              SPLIT_PART(SPLIT_PART(title, '｜', 1), '|', 1),  -- Remove everything after pipes
              '^.+/', ''  -- Remove paths
            ),
            '^karaoke\s+', '', 'i'  -- Remove karaoke prefix
          ),
          'nhac\s+song|nhạc\s+sống', '', 'gi'  -- Remove nhac song
        ),
        'chat\s+luong\s+cao|de\s+hat|chuan|chuẩn', '', 'gi'  -- Remove noise words
      ),
      '\s{2,}', ' ', 'g'  -- Clean multiple spaces
    )
  ))
WHERE title ~ '｜' OR title ~ '\|' OR title ~ '/';

-- Clean kara_song_groups.base_title_display
UPDATE kara_song_groups
SET base_title_display = 
  INITCAP(TRIM(
    REGEXP_REPLACE(
      REGEXP_REPLACE(
        REGEXP_REPLACE(
          REGEXP_REPLACE(
            REGEXP_REPLACE(
              SPLIT_PART(SPLIT_PART(base_title_display, '｜', 1), '|', 1),  -- Remove pipes
              '^.+/', ''  -- Remove paths
            ),
            '^karaoke\s+', '', 'i'  -- Remove karaoke
          ),
          'nhac\s+song|nhạc\s+sống', '', 'gi'  -- Remove nhac song
        ),
        'chat\s+luong\s+cao|de\s+hat|chuan|chuẩn', '', 'gi'  -- Remove noise
      ),
      '\s{2,}', ' ', 'g'  -- Clean spaces
    )
  ))
WHERE base_title_display ~ '｜' OR base_title_display ~ '\|' OR base_title_display ~ '/';

-- Show sample results
SELECT 
  '=== CLEANED TITLES SAMPLE ===' as section,
  base_title_display
FROM kara_song_groups
WHERE base_title_display ~ 'Khi'
LIMIT 10;

COMMIT;
