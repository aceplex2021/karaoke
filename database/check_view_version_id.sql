-- Check if kara_song_versions_detail_view has version_id column
-- This will help us understand what columns are available

-- Method 0: Get view definitions to check for circular references
SELECT 
    schemaname,
    viewname,
    definition
FROM pg_views
WHERE viewname IN ('kara_files_parsed_preview', 'kara_song_versions_detail_view')
ORDER BY viewname;

-- Method 1: Check column names
SELECT 
    column_name,
    data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'kara_song_versions_detail_view'
ORDER BY ordinal_position;

-- Method 2: Get a sample row to see all columns
SELECT *
FROM kara_song_versions_detail_view
WHERE song_title ILIKE '%noi dau muon mang%'
LIMIT 1;

-- Method 3: If view doesn't have version_id, we need to get it from kara_files
-- Test query to get version_id from files (query kara_files directly to avoid recursion)
SELECT 
  f.id as file_id,
  f.version_id as version_id_from_files,
  f.storage_path,
  -- Extract parsed metadata directly (avoiding view recursion)
  NULLIF(
    trim((regexp_match(f.storage_path, '\(([^)]+)\)'))[1]),
    ''
  ) AS artist,
  CASE
    WHEN f.storage_path ~* 'tone\s*nữ|__nu' THEN 'Nữ'
    WHEN f.storage_path ~* 'tone\s*nam|__nam' THEN 'Nam'
    WHEN f.storage_path ~* 'song\s*ca|__song_ca' THEN 'Song ca'
    ELSE NULL
  END AS tone,
  CASE
    WHEN f.storage_path ~* 'kim\s*quy' THEN 'Kim Quy'
    WHEN f.storage_path ~* 'hiếu|hieu' THEN 'Hiếu Organ'
    WHEN f.storage_path ~* 'trọng\s*hiếu' THEN 'Trọng Hiếu'
    WHEN f.storage_path ~* 'yêu\s*ca\s*hát|love\s*singing' THEN 'Yêu Ca Hát'
    ELSE NULL
  END AS mixer,
  CASE
    WHEN f.storage_path ~* 'slow|ballad' THEN 'Ballad'
    WHEN f.storage_path ~* 'bolero' THEN 'Bolero'
    WHEN f.storage_path ~* 'remix' THEN 'Remix'
    WHEN f.storage_path ~* 'nhạc sống' THEN 'Nhạc sống'
    ELSE NULL
  END AS style
FROM kara_files f
INNER JOIN kara_versions v ON f.version_id = v.id
INNER JOIN kara_songs s ON v.song_id = s.id
INNER JOIN kara_song_group_members m ON s.id = m.song_id
INNER JOIN kara_song_groups g ON m.group_id = g.id
WHERE (g.base_title_unaccent ILIKE '%noi dau muon mang%'
   OR g.base_title_display ILIKE '%noi dau muon mang%')
  AND f.type = 'video'
LIMIT 5;
