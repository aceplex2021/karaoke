-- Get the definition of kara_song_versions_view
-- We need this to update it to include group_id

SELECT 
    viewname,
    definition
FROM pg_views
WHERE schemaname = 'public'
  AND viewname = 'kara_song_versions_view';
