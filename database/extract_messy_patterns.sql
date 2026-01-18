-- ============================================
-- EXTRACT MESSY TITLE PATTERNS FOR MANUAL REVIEW
-- ============================================
-- Categorizes all messy patterns in song titles
-- User will review and define exact cleanup rules
-- ============================================

-- Category 1: Titles with pipe separators (｜)
SELECT 
  'CATEGORY 1: PIPE SEPARATORS' as category,
  COUNT(*) as total_songs,
  title as example_title,
  SUBSTRING(title FROM POSITION('｜' IN title)) as pipe_content
FROM kara_songs
WHERE title LIKE '%｜%'
GROUP BY title
ORDER BY LENGTH(title) DESC
LIMIT 50;

-- Category 2: Titles starting with path fragments
SELECT 
  'CATEGORY 2: PATH FRAGMENTS' as category,
  COUNT(*) as count,
  title as example_title
FROM kara_songs
WHERE title ILIKE 'incoming%' OR title ILIKE '%/%'
GROUP BY title
ORDER BY LENGTH(title) DESC
LIMIT 30;

-- Category 3: Titles with "Nhac Song" or "Nhạc Sống"
SELECT 
  'CATEGORY 3: NHAC SONG/NHAC SONG' as category,
  COUNT(*) as count,
  title as example_title
FROM kara_songs
WHERE title ~* '(nhac song|nhạc sống)'
GROUP BY title
ORDER BY RANDOM()
LIMIT 30;

-- Category 4: Titles with tone indicators
SELECT 
  'CATEGORY 4: TONE INDICATORS' as category,
  COUNT(*) as count,
  title as example_title
FROM kara_songs
WHERE title ~* '(tone nam|tone nữ|tone nu|soprano|tenor)'
GROUP BY title
ORDER BY RANDOM()
LIMIT 30;

-- Category 5: Titles with quality/style descriptors
SELECT 
  'CATEGORY 5: QUALITY DESCRIPTORS' as category,
  COUNT(*) as count,
  title as example_title
FROM kara_songs
WHERE title ~* '(chat luong cao|de hat|moi de hat|hd|4k|beat chuẩn|beat chuan)'
GROUP BY title
ORDER BY RANDOM()
LIMIT 30;

-- Category 6: Titles with years at the end
SELECT 
  'CATEGORY 6: YEARS AT END' as category,
  COUNT(*) as count,
  title as example_title,
  SUBSTRING(title FROM '\\d{4}$') as year
FROM kara_songs
WHERE title ~ '\\d{4}$'
GROUP BY title
ORDER BY RANDOM()
LIMIT 30;

-- Category 7: Titles with song type descriptors
SELECT 
  'CATEGORY 7: SONG TYPES' as category,
  COUNT(*) as count,
  title as example_title
FROM kara_songs
WHERE title ~* '(song ca|lien khuc|bolero|rumba|cha cha cha|slow)'
GROUP BY title
ORDER BY RANDOM()
LIMIT 30;

-- Category 8: Titles with production credits
SELECT 
  'CATEGORY 8: PRODUCTION CREDITS' as category,
  COUNT(*) as count,
  title as example_title
FROM kara_songs
WHERE title ~* '(productions|official|karaoke version|backing track|music box|ktv|opus convention)'
GROUP BY title
ORDER BY RANDOM()
LIMIT 30;

-- Category 9: English artist + song format
SELECT 
  'CATEGORY 9: ENGLISH ARTIST + SONG' as category,
  COUNT(*) as count,
  title as example_title
FROM kara_songs
WHERE title ~ '^[A-Z][a-z]+ [A-Z][a-z]+ [A-Z]'
  AND title !~ '[ａ-ｚ｜]'
GROUP BY title
ORDER BY title
LIMIT 50;

-- Category 10: Titles with hashtags or special chars
SELECT 
  'CATEGORY 10: HASHTAGS/SPECIAL CHARS' as category,
  COUNT(*) as count,
  title as example_title
FROM kara_songs
WHERE title ~ '#|✦|–|｜'
GROUP BY title
ORDER BY RANDOM()
LIMIT 30;

-- Summary Statistics
SELECT 
  'SUMMARY STATISTICS' as section,
  'Titles with pipe (｜)' as pattern,
  COUNT(*) as count
FROM kara_songs
WHERE title LIKE '%｜%'
UNION ALL
SELECT 
  'SUMMARY STATISTICS',
  'Titles with "Nhac Song"',
  COUNT(*)
FROM kara_songs
WHERE title ~* 'nhac song'
UNION ALL
SELECT 
  'SUMMARY STATISTICS',
  'Titles with tone indicators',
  COUNT(*)
FROM kara_songs
WHERE title ~* '(tone nam|tone nu|soprano|tenor)'
UNION ALL
SELECT 
  'SUMMARY STATISTICS',
  'Titles with years',
  COUNT(*)
FROM kara_songs
WHERE title ~ '\\d{4}'
UNION ALL
SELECT 
  'SUMMARY STATISTICS',
  'Titles with path fragments',
  COUNT(*)
FROM kara_songs
WHERE title ILIKE '%/%'
UNION ALL
SELECT 
  'SUMMARY STATISTICS',
  'English Artist + Song format',
  COUNT(*)
FROM kara_songs
WHERE title ~ '^[A-Z][a-z]+ [A-Z][a-z]+ [A-Z]'
  AND title !~ '[ａ-ｚ｜]'
UNION ALL
SELECT 
  'SUMMARY STATISTICS',
  'Total songs in database',
  COUNT(*)
FROM kara_songs;
