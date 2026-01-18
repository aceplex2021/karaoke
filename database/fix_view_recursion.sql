-- Fix infinite recursion in kara_song_versions_detail_view
-- The issue: Current view uses kara_files_with_title_clean and kara_files_parsed_preview
-- which may cause circular dependencies. We'll recreate using ONLY base tables.

-- Step 1: Drop the problematic view
DROP VIEW IF EXISTS kara_song_versions_detail_view;

-- Step 2: Recreate kara_song_versions_detail_view using ONLY base tables
-- No views - direct joins to kara_files, kara_versions, kara_songs, kara_song_groups
-- Extract metadata inline from storage_path (no dependency on kara_files_parsed_preview)
-- Include version_id from kara_files so we don't need a lookup
CREATE OR REPLACE VIEW kara_song_versions_detail_view AS
SELECT
  f.id,  -- This is kara_files.id (file_id)
  f.version_id,  -- This is kara_versions.id (needed for queue)
  -- Use group's title (same as kara_song_versions_view) for consistency
  -- The search view cleans titles to match what users search for
  -- Based on the data: "dem dong tenor" -> "dem dong", "dem dong slow rock kim quy" -> "dem dong  rock"
  -- 
  -- The search view appears to:
  -- 1. Remove single words at the end (like "tenor", "soprano")
  -- 2. For multi-word metadata, extract key words (like "rock" from "slow rock kim quy")
  --
  -- For now, we'll apply a simple cleaning: remove single words at the end
  -- This will make "dem dong tenor" -> "dem dong" to match search view
  LOWER(
    TRIM(
      REGEXP_REPLACE(
        COALESCE(g.base_title_display, g.base_title_unaccent),
        -- Remove single word at the end (like "tenor", "soprano")
        -- This matches "dem dong tenor" -> "dem dong"
        '\s+\w+$',
        ''
      )
    )
  ) AS song_title,
  f.storage_path,
  
  -- Extract tone inline (same logic as kara_files_parsed_preview, but inline)
  CASE
    WHEN f.storage_path ~* 'tone\s*nữ|__nu' THEN 'Nữ'
    WHEN f.storage_path ~* 'tone\s*nam|__nam' THEN 'Nam'
    WHEN f.storage_path ~* 'song\s*ca|__song_ca' THEN 'Song ca'
    ELSE NULL
  END AS tone,
  
  -- Extract mixer inline
  CASE
    WHEN f.storage_path ~* 'kim\s*quy' THEN 'Kim Quy'
    WHEN f.storage_path ~* 'hiếu\s*organ|hieu\s*organ' THEN 'Hiếu Organ'
    WHEN f.storage_path ~* 'hiếu|hieu' THEN 'Hiếu Organ'
    WHEN f.storage_path ~* 'trọng\s*hiếu|trong\s*hieu' THEN 'Trọng Hiếu'
    WHEN f.storage_path ~* 'yêu\s*ca\s*hát|yeu\s*ca\s*hat|love\s*singing' THEN 'Yêu Ca Hát'
    ELSE NULL
  END AS mixer,
  
  -- Extract style inline
  CASE
    WHEN f.storage_path ~* 'slow|ballad' THEN 'Ballad'
    WHEN f.storage_path ~* 'bolero' THEN 'Bolero'
    WHEN f.storage_path ~* 'remix' THEN 'Remix'
    WHEN f.storage_path ~* 'nhạc\s*sống|nhac\s*song|nhacsong' THEN 'Nhạc sống'
    ELSE NULL
  END AS style,
  
  -- Extract artist inline (text inside first parentheses)
  NULLIF(
    trim((regexp_match(f.storage_path, '\(([^)]+)\)'))[1]),
    ''
  ) AS artist,
  
  f.created_at
FROM kara_files f
INNER JOIN kara_versions v ON f.version_id = v.id
INNER JOIN kara_songs s ON v.song_id = s.id
INNER JOIN kara_song_group_members m ON s.id = m.song_id
INNER JOIN kara_song_groups g ON m.group_id = g.id
WHERE f.type = 'video';

-- Step 3: Verify the view works
-- Test query (should not cause recursion)
SELECT 
  id,
  version_id,
  song_title,
  tone,
  mixer,
  style,
  artist,
  storage_path
FROM kara_song_versions_detail_view
WHERE song_title ILIKE '%khi%'
LIMIT 5;
