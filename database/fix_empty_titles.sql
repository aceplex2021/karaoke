-- ============================================
-- FIX TITLES THAT BECAME EMPTY
-- ============================================
-- Restore from base_title_unaccent and clean properly
-- Date: January 17, 2026
-- ============================================

BEGIN;

-- Fix empty or very short titles in groups
UPDATE kara_song_groups
SET base_title_display = INITCAP(
  TRIM(
    REGEXP_REPLACE(
      CASE 
        WHEN POSITION('｜' IN base_title_unaccent) > 0 THEN
          TRIM(SPLIT_PART(base_title_unaccent, '｜', 2))  -- Get part after first pipe
        WHEN POSITION('|' IN base_title_unaccent) > 0 THEN
          TRIM(SPLIT_PART(base_title_unaccent, '|', 2))
        ELSE
          base_title_unaccent
      END,
      'nhac\s+song|nhạc\s+sống|chuan|chuẩn', '', 'gi'
    )
  )
)
WHERE base_title_display IS NULL 
   OR base_title_display = '' 
   OR LENGTH(base_title_display) < 3;

-- Clean remaining pipes and noise from all titles
UPDATE kara_song_groups
SET base_title_display = 
  INITCAP(TRIM(
    REGEXP_REPLACE(
      REGEXP_REPLACE(
        REPLACE(REPLACE(base_title_display, '｜', ''), '|', ''),
        'nhac\s+song|nhạc\s+sống', '', 'gi'
      ),
      '\s{2,}', ' ', 'g'
    )
  ))
WHERE base_title_display ~ '｜' OR base_title_display ~ '\|';

-- Show test results
SELECT 
  base_title_display,
  base_title_unaccent
FROM kara_song_groups
WHERE base_title_unaccent ~ 'khi nao chau';

COMMIT;
