-- ============================================
-- INVESTIGATE DUPLICATE SONGS (CONSOLIDATED)
-- ============================================
-- Run this entire script in Supabase SQL Editor
-- All results shown in one consolidated view
-- ============================================

CREATE TEMP TABLE duplicate_analysis (
  section TEXT,
  subsection TEXT,
  key TEXT,
  value TEXT,
  details JSONB
);

-- ============================================
-- SECTION 1: SUMMARY STATISTICS
-- ============================================

INSERT INTO duplicate_analysis (section, subsection, key, value, details)
SELECT 
  '1. Summary' as section,
  'Statistics' as subsection,
  metric as key,
  count::TEXT as value,
  NULL::jsonb as details
FROM (
  SELECT 
    'Total duplicate sets' as metric,
    COUNT(*) as count
  FROM (
    SELECT title, COALESCE(artist_id::text, 'NULL') as artist, COUNT(*) as dup_count
    FROM kara_songs
    GROUP BY title, artist_id
    HAVING COUNT(*) > 1
  ) dups
  UNION ALL
  SELECT 
    'Total duplicate song records',
    SUM(dup_count) - COUNT(*) as count
  FROM (
    SELECT title, COALESCE(artist_id::text, 'NULL') as artist, COUNT(*) as dup_count
    FROM kara_songs
    GROUP BY title, artist_id
    HAVING COUNT(*) > 1
  ) dups
  UNION ALL
  SELECT 
    'Total songs affected',
    SUM(dup_count)
  FROM (
    SELECT title, COALESCE(artist_id::text, 'NULL') as artist, COUNT(*) as dup_count
    FROM kara_songs
    GROUP BY title, artist_id
    HAVING COUNT(*) > 1
  ) dups
  UNION ALL
  SELECT 
    'Largest duplicate set (count)',
    MAX(dup_count)
  FROM (
    SELECT title, COALESCE(artist_id::text, 'NULL') as artist, COUNT(*) as dup_count
    FROM kara_songs
    GROUP BY title, artist_id
    HAVING COUNT(*) > 1
  ) dups
) stats;

-- ============================================
-- SECTION 2: SAMPLE DUPLICATES (TOP 20)
-- ============================================

INSERT INTO duplicate_analysis (section, subsection, key, value, details)
SELECT 
  '2. Top Duplicates' as section,
  'Sample Duplicate Sets' as subsection,
  s.title as key,
  COUNT(*)::TEXT || ' duplicates' as value,
  jsonb_build_object(
    'song_ids', ARRAY_AGG(s.id ORDER BY s.created_at),
    'version_counts', ARRAY_AGG((SELECT COUNT(*) FROM kara_versions v WHERE v.song_id = s.id) ORDER BY s.created_at),
    'file_counts', ARRAY_AGG((SELECT COUNT(*) FROM kara_versions v JOIN kara_files f ON v.id = f.version_id WHERE v.song_id = s.id) ORDER BY s.created_at)
  ) as details
FROM kara_songs s
GROUP BY s.title, s.artist_id
HAVING COUNT(*) > 1
ORDER BY COUNT(*) DESC, s.title
LIMIT 20;

-- ============================================
-- SECTION 3: USAGE CHECK
-- ============================================

INSERT INTO duplicate_analysis (section, subsection, key, value, details)
SELECT 
  '3. Usage Check' as section,
  'In Use' as subsection,
  'Duplicates in queue' as key,
  COUNT(DISTINCT s.id)::TEXT as value,
  NULL::jsonb as details
FROM kara_songs s
JOIN kara_queue q ON s.id = q.song_id
WHERE (s.title, COALESCE(s.artist_id::text, 'NULL')) IN (
  SELECT title, COALESCE(artist_id::text, 'NULL')
  FROM kara_songs
  GROUP BY title, artist_id
  HAVING COUNT(*) > 1
);

INSERT INTO duplicate_analysis (section, subsection, key, value, details)
SELECT 
  '3. Usage Check',
  'In Use',
  'Duplicates in history',
  COUNT(DISTINCT s.id)::TEXT,
  NULL::jsonb
FROM kara_songs s
JOIN kara_song_history h ON s.id = h.song_id
WHERE (s.title, COALESCE(s.artist_id::text, 'NULL')) IN (
  SELECT title, COALESCE(artist_id::text, 'NULL')
  FROM kara_songs
  GROUP BY title, artist_id
  HAVING COUNT(*) > 1
);

-- ============================================
-- SECTION 4: MERGE STRATEGY
-- ============================================

-- For each duplicate set, show which to keep vs delete
INSERT INTO duplicate_analysis (section, subsection, key, value, details)
SELECT 
  '4. Merge Strategy' as section,
  'Keep vs Delete' as subsection,
  title as key,
  'Keep: ' || keep_id || ', Delete: ' || array_length(delete_ids, 1)::TEXT as value,
  jsonb_build_object(
    'keep_song_id', keep_id,
    'delete_song_ids', delete_ids,
    'keep_versions', keep_versions,
    'total_duplicates', duplicate_count
  ) as details
FROM (
  SELECT 
    s.title,
    COUNT(*) as duplicate_count,
    (ARRAY_AGG(s.id ORDER BY 
      (SELECT COUNT(*) FROM kara_versions v WHERE v.song_id = s.id) DESC,
      s.created_at ASC
    ))[1] as keep_id,
    (ARRAY_AGG(s.id ORDER BY 
      (SELECT COUNT(*) FROM kara_versions v WHERE v.song_id = s.id) DESC,
      s.created_at ASC
    ))[2:] as delete_ids,
    (ARRAY_AGG((SELECT COUNT(*) FROM kara_versions v WHERE v.song_id = s.id) ORDER BY 
      (SELECT COUNT(*) FROM kara_versions v WHERE v.song_id = s.id) DESC,
      s.created_at ASC
    ))[1] as keep_versions
  FROM kara_songs s
  GROUP BY s.title, s.artist_id
  HAVING COUNT(*) > 1
  ORDER BY COUNT(*) DESC, s.title
  LIMIT 20
) strategy;

-- ============================================
-- FINAL OUTPUT
-- ============================================

SELECT 
  section,
  subsection,
  key,
  value,
  CASE 
    WHEN details IS NOT NULL THEN jsonb_pretty(details)
    ELSE NULL
  END as details_json
FROM duplicate_analysis
ORDER BY section, subsection, key;
