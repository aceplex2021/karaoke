-- Check the definition of kara_song_versions_view to see what it uses for song_title
-- This will help us understand why search results don't match version queries

SELECT 
    schemaname,
    viewname,
    definition
FROM pg_views
WHERE schemaname = 'public'
  AND viewname = 'kara_song_versions_view';

-- Also check kara_song_versions_detail_view
SELECT 
    schemaname,
    viewname,
    definition
FROM pg_views
WHERE schemaname = 'public'
  AND viewname = 'kara_song_versions_detail_view';

-- Test: Compare song_title from both views for a known song
-- Search for "khi" in both views to see the difference
SELECT 
    'search_view' as source,
    song_title,
    version_count
FROM kara_song_versions_view
WHERE song_title ILIKE '%khi%'
LIMIT 5;

SELECT 
    'detail_view' as source,
    song_title,
    COUNT(*) as count
FROM kara_song_versions_detail_view
WHERE song_title ILIKE '%khi%'
GROUP BY song_title
LIMIT 5;
