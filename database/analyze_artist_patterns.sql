-- ============================================
-- ANALYZE STORAGE_PATH FOR ARTIST EXTRACTION
-- ============================================
-- Examines all storage_path patterns to understand
-- how artist names are embedded in file paths
-- ============================================

-- Sample 1: Random storage paths to see variety
SELECT 
  '=== SAMPLE STORAGE PATHS ===' as section,
  storage_path,
  LENGTH(storage_path) as path_length
FROM kara_files
ORDER BY RANDOM()
LIMIT 30;

-- Sample 2: Look at paths with parentheses (often contain artist info)
SELECT 
  '=== PATHS WITH PARENTHESES ===' as section,
  storage_path
FROM kara_files
WHERE storage_path ~ '\([^)]+\)'
ORDER BY RANDOM()
LIMIT 20;

-- Sample 3: Paths starting with specific patterns
SELECT 
  '=== PATHS STARTING WITH KARAOKE ===' as section,
  storage_path
FROM kara_files
WHERE storage_path ~* '/karaoke '
ORDER BY RANDOM()
LIMIT 20;

-- Sample 4: Paths with dashes (common separator)
SELECT 
  '=== PATHS WITH DASHES ===' as section,
  storage_path
FROM kara_files
WHERE storage_path ~ ' - '
ORDER BY RANDOM()
LIMIT 20;

-- Sample 5: Look for common artist patterns
-- Pattern: "Artist Name - Song Title"
SELECT 
  '=== POTENTIAL ARTIST - SONG FORMAT ===' as section,
  storage_path,
  REGEXP_REPLACE(
    REGEXP_REPLACE(storage_path, '^.+/', ''),
    '\.[^.]+$', ''
  ) as filename_no_ext,
  SUBSTRING(
    REGEXP_REPLACE(
      REGEXP_REPLACE(storage_path, '^.+/', ''),
      '\.[^.]+$', ''
    )
    FROM '^(.+?) - '
  ) as potential_artist
FROM kara_files
WHERE storage_path ~ ' - '
ORDER BY RANDOM()
LIMIT 20;

-- Sample 6: English artist names (capitalized words at start)
SELECT 
  '=== ENGLISH ARTIST NAMES ===' as section,
  storage_path,
  REGEXP_REPLACE(storage_path, '^.+/', '') as filename,
  SUBSTRING(
    REGEXP_REPLACE(storage_path, '^.+/', '')
    FROM '^([A-Z][a-z]+(?: [A-Z][a-z]+){0,2})'
  ) as potential_artist
FROM kara_files
WHERE storage_path ~ '^/Videos/[A-Z][a-z]+ [A-Z]'
ORDER BY RANDOM()
LIMIT 20;

-- Statistics: Path pattern frequencies
SELECT 
  '=== PATH PATTERN STATISTICS ===' as section,
  'Total files' as pattern,
  COUNT(*) as count
FROM kara_files
UNION ALL
SELECT 
  '',
  'Has parentheses ( )',
  COUNT(*)
FROM kara_files
WHERE storage_path ~ '\([^)]+\)'
UNION ALL
SELECT 
  '',
  'Has dash " - "',
  COUNT(*)
FROM kara_files
WHERE storage_path ~ ' - '
UNION ALL
SELECT 
  '',
  'Starts with "Karaoke"',
  COUNT(*)
FROM kara_files
WHERE storage_path ~* '/karaoke '
UNION ALL
SELECT 
  '',
  'Has brackets [ ]',
  COUNT(*)
FROM kara_files
WHERE storage_path ~ '\[[^\]]+\]'
UNION ALL
SELECT 
  '',
  'English name at start',
  COUNT(*)
FROM kara_files
WHERE storage_path ~ '^/Videos/[A-Z][a-z]+ [A-Z][a-z]+ [A-Z]';

-- Analyze what's in parentheses
SELECT 
  '=== CONTENT IN PARENTHESES ===' as section,
  SUBSTRING(storage_path FROM '\(([^)]+)\)') as parentheses_content,
  COUNT(*) as frequency
FROM kara_files
WHERE storage_path ~ '\([^)]+\)'
GROUP BY SUBSTRING(storage_path FROM '\(([^)]+)\)')
ORDER BY COUNT(*) DESC
LIMIT 30;

-- Analyze what's in brackets
SELECT 
  '=== CONTENT IN BRACKETS ===' as section,
  SUBSTRING(storage_path FROM '\[([^\]]+)\]') as bracket_content,
  COUNT(*) as frequency
FROM kara_files
WHERE storage_path ~ '\[[^\]]+\]'
GROUP BY SUBSTRING(storage_path FROM '\[([^\]]+)\]')
ORDER BY COUNT(*) DESC
LIMIT 30;

-- Look at the structure: /Videos/XXXXX
SELECT 
  '=== FILENAME START PATTERNS ===' as section,
  SUBSTRING(
    REGEXP_REPLACE(storage_path, '^/Videos/', '')
    FROM '^([^ ]+)'
  ) as first_word,
  COUNT(*) as frequency
FROM kara_files
GROUP BY first_word
ORDER BY COUNT(*) DESC
LIMIT 30;
