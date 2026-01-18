-- Verify that both views use the same song_title logic
-- This will help diagnose why search results don't match version queries

-- 1. Check what kara_song_versions_view uses for song_title
SELECT 
    schemaname,
    viewname,
    definition
FROM pg_views
WHERE schemaname = 'public'
  AND viewname = 'kara_song_versions_view';

-- 2. Check what kara_song_versions_detail_view uses for song_title
SELECT 
    schemaname,
    viewname,
    definition
FROM pg_views
WHERE schemaname = 'public'
  AND viewname = 'kara_song_versions_detail_view';

-- 3. Test: Compare actual song_title values for "khi"
-- From search view
SELECT 
    'search_view' as source,
    song_title,
    version_count,
    LENGTH(song_title) as title_length,
    LOWER(song_title) as title_lower,
    TRIM(song_title) as title_trimmed
FROM kara_song_versions_view
WHERE song_title ILIKE '%khi%'
ORDER BY song_title
LIMIT 10;

-- From detail view (grouped by song_title)
SELECT 
    'detail_view' as source,
    song_title,
    COUNT(*) as version_count,
    LENGTH(song_title) as title_length,
    LOWER(song_title) as title_lower,
    TRIM(song_title) as title_trimmed
FROM kara_song_versions_detail_view
WHERE song_title ILIKE '%khi%'
GROUP BY song_title
ORDER BY song_title
LIMIT 10;

-- 4. Check if there's an exact match for "khi" (case-insensitive, trimmed)
SELECT 
    'exact_match_test' as test,
    sv.song_title as search_view_title,
    dv.song_title as detail_view_title,
    CASE 
        WHEN LOWER(TRIM(sv.song_title)) = LOWER(TRIM(dv.song_title)) THEN 'MATCH'
        ELSE 'MISMATCH'
    END as match_status
FROM (
    SELECT DISTINCT song_title 
    FROM kara_song_versions_view 
    WHERE song_title ILIKE '%khi%'
    LIMIT 5
) sv
CROSS JOIN (
    SELECT DISTINCT song_title 
    FROM kara_song_versions_detail_view 
    WHERE song_title ILIKE '%khi%'
    LIMIT 5
) dv
ORDER BY sv.song_title, dv.song_title;
