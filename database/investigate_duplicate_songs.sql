-- ============================================
-- INVESTIGATE DUPLICATE SONGS
-- ============================================
-- Date: 2026-01-17
-- Issue: 20+ songs with same title+artist_id exist multiple times
-- Impact: Duplicate results in search, inflated version counts
-- ============================================

-- ============================================
-- STEP 1: FIND ALL DUPLICATES
-- ============================================

-- List all duplicate songs with details
SELECT 
  s.title,
  s.artist_id,
  COUNT(*) as duplicate_count,
  ARRAY_AGG(s.id ORDER BY s.created_at) as song_ids,
  ARRAY_AGG(s.created_at ORDER BY s.created_at) as created_dates,
  -- How many versions does each have?
  ARRAY_AGG((SELECT COUNT(*) FROM kara_versions v WHERE v.song_id = s.id) ORDER BY s.created_at) as version_counts,
  -- How many files?
  ARRAY_AGG((SELECT COUNT(*) FROM kara_versions v 
             JOIN kara_files f ON v.id = f.version_id 
             WHERE v.song_id = s.id) ORDER BY s.created_at) as file_counts,
  -- Are they in use?
  ARRAY_AGG((SELECT COUNT(*) FROM kara_queue q WHERE q.song_id = s.id) ORDER BY s.created_at) as queue_counts,
  ARRAY_AGG((SELECT COUNT(*) FROM kara_song_history h WHERE h.song_id = s.id) ORDER BY s.created_at) as history_counts
FROM kara_songs s
GROUP BY s.title, s.artist_id
HAVING COUNT(*) > 1
ORDER BY COUNT(*) DESC, s.title;

-- ============================================
-- STEP 2: SUMMARY STATISTICS
-- ============================================

-- How many songs are affected?
SELECT 
  'Total duplicate sets' as metric,
  COUNT(*) as count
FROM (
  SELECT title, artist_id, COUNT(*) as dup_count
  FROM kara_songs
  GROUP BY title, artist_id
  HAVING COUNT(*) > 1
) dups
UNION ALL
SELECT 
  'Total duplicate song records',
  SUM(dup_count) - COUNT(*) as count
FROM (
  SELECT title, artist_id, COUNT(*) as dup_count
  FROM kara_songs
  GROUP BY title, artist_id
  HAVING COUNT(*) > 1
) dups
UNION ALL
SELECT 
  'Largest duplicate set (count)',
  MAX(dup_count)
FROM (
  SELECT title, artist_id, COUNT(*) as dup_count
  FROM kara_songs
  GROUP BY title, artist_id
  HAVING COUNT(*) > 1
) dups;

-- ============================================
-- STEP 3: WHICH SONG TO KEEP?
-- ============================================

-- For each duplicate set, identify the "canonical" song to keep
-- Strategy: Keep the one with most versions, or oldest if tied
SELECT 
  title,
  artist_id,
  duplicate_count,
  song_ids[1] as keep_song_id,
  song_ids[2:] as delete_song_ids,
  created_dates[1] as keep_created,
  version_counts[1] as keep_versions,
  file_counts[1] as keep_files
FROM (
  SELECT 
    s.title,
    s.artist_id,
    COUNT(*) as duplicate_count,
    -- Order by: most versions first, then oldest
    ARRAY_AGG(s.id ORDER BY 
      (SELECT COUNT(*) FROM kara_versions v WHERE v.song_id = s.id) DESC,
      s.created_at ASC
    ) as song_ids,
    ARRAY_AGG(s.created_at ORDER BY 
      (SELECT COUNT(*) FROM kara_versions v WHERE v.song_id = s.id) DESC,
      s.created_at ASC
    ) as created_dates,
    ARRAY_AGG((SELECT COUNT(*) FROM kara_versions v WHERE v.song_id = s.id) ORDER BY 
      (SELECT COUNT(*) FROM kara_versions v WHERE v.song_id = s.id) DESC,
      s.created_at ASC
    ) as version_counts,
    ARRAY_AGG((SELECT COUNT(*) FROM kara_versions v 
               JOIN kara_files f ON v.id = f.version_id 
               WHERE v.song_id = s.id) ORDER BY 
      (SELECT COUNT(*) FROM kara_versions v WHERE v.song_id = s.id) DESC,
      s.created_at ASC
    ) as file_counts
  FROM kara_songs s
  GROUP BY s.title, s.artist_id
  HAVING COUNT(*) > 1
) duplicates
ORDER BY duplicate_count DESC, title;

-- ============================================
-- STEP 4: CHECK FOR COMPLICATIONS
-- ============================================

-- Are any duplicates currently in the queue?
SELECT 
  'Duplicates in queue' as issue,
  COUNT(DISTINCT s.id) as affected_songs
FROM kara_songs s
JOIN kara_queue q ON s.id = q.song_id
WHERE (s.title, s.artist_id) IN (
  SELECT title, artist_id
  FROM kara_songs
  GROUP BY title, artist_id
  HAVING COUNT(*) > 1
);

-- Are any duplicates in history?
SELECT 
  'Duplicates in history' as issue,
  COUNT(DISTINCT s.id) as affected_songs
FROM kara_songs s
JOIN kara_song_history h ON s.id = h.song_id
WHERE (s.title, s.artist_id) IN (
  SELECT title, artist_id
  FROM kara_songs
  GROUP BY title, artist_id
  HAVING COUNT(*) > 1
);

-- Are any duplicates in user favorites?
SELECT 
  'Duplicates in favorites' as issue,
  COUNT(*) as affected_users
FROM kara_user_preferences
WHERE favorite_song_ids::jsonb ?| (
  SELECT ARRAY_AGG(id::text)
  FROM kara_songs s
  WHERE (s.title, s.artist_id) IN (
    SELECT title, artist_id
    FROM kara_songs
    GROUP BY title, artist_id
    HAVING COUNT(*) > 1
  )
);
