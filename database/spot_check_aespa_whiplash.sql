-- ============================================
-- SPOT CHECK: Verify "Aespa Whiplash" is a duplicate
-- ============================================

-- Check the two song IDs
SELECT 
  'SONG DETAILS' as section,
  id,
  title,
  artist_id,
  base_title_unaccent,
  created_at,
  (SELECT COUNT(*) FROM kara_versions v WHERE v.song_id = s.id) as version_count,
  (SELECT COUNT(*) FROM kara_versions v 
   JOIN kara_files f ON v.id = f.version_id 
   WHERE v.song_id = s.id) as file_count
FROM kara_songs s
WHERE id IN (
  '88e2ab61-a707-4ed2-b5c7-b63395ed5d5e',  -- Keep this one
  '26fe1aa4-8229-4062-83a7-279c30648a29'   -- Delete this one
);

-- Check their versions
SELECT 
  'VERSIONS' as section,
  v.id as version_id,
  v.song_id,
  v.label,
  v.key,
  v.tempo,
  v.is_default,
  (SELECT COUNT(*) FROM kara_files f WHERE f.version_id = v.id) as file_count
FROM kara_versions v
WHERE v.song_id IN (
  '88e2ab61-a707-4ed2-b5c7-b63395ed5d5e',
  '26fe1aa4-8229-4062-83a7-279c30648a29'
);

-- Check their files
SELECT 
  'FILES' as section,
  f.id,
  f.version_id,
  v.song_id,
  f.storage_path,
  f.type,
  f.format
FROM kara_files f
JOIN kara_versions v ON f.version_id = v.id
WHERE v.song_id IN (
  '88e2ab61-a707-4ed2-b5c7-b63395ed5d5e',
  '26fe1aa4-8229-4062-83a7-279c30648a29'
)
ORDER BY v.song_id, f.storage_path;

-- Check what groups they're in
SELECT 
  'GROUPS' as section,
  m.song_id,
  m.group_id,
  g.base_title_display
FROM kara_song_group_members m
JOIN kara_song_groups g ON m.group_id = g.id
WHERE m.song_id IN (
  '88e2ab61-a707-4ed2-b5c7-b63395ed5d5e',
  '26fe1aa4-8229-4062-83a7-279c30648a29'
);
