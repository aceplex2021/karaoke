-- Inspect columns in kara_song_versions_view
-- This will show all columns and their data types

SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'kara_song_versions_view'
ORDER BY ordinal_position;

-- Inspect columns in kara_song_versions_detail_view
-- This will show all columns and their data types

SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'kara_song_versions_detail_view'
ORDER BY ordinal_position;

-- Alternative: Get a sample row from each view to see actual column names and values
-- (This will show what columns actually exist and their sample data)

-- Sample from kara_song_versions_view
SELECT *
FROM kara_song_versions_view
LIMIT 1;

-- Sample from kara_song_versions_detail_view
SELECT *
FROM kara_song_versions_detail_view
LIMIT 1;
