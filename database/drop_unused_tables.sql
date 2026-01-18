-- ============================================
-- DROP UNUSED TABLES
-- ============================================
-- Removes empty tables that are not being used
-- Safe to run - these tables have 0 rows
-- ============================================

-- Drop unused tables
DROP TABLE IF EXISTS kara_song_tags CASCADE;
DROP TABLE IF EXISTS kara_tags CASCADE;
DROP TABLE IF EXISTS kara_lyrics CASCADE;
DROP TABLE IF EXISTS kara_artists CASCADE;

-- Verify they're gone
SELECT 
  table_name,
  CASE 
    WHEN table_name IN (
      SELECT tablename FROM pg_tables 
      WHERE schemaname = 'public' AND tablename LIKE 'kara_%'
    ) THEN 'EXISTS'
    ELSE 'DROPPED'
  END as status
FROM (
  VALUES 
    ('kara_song_tags'),
    ('kara_tags'),
    ('kara_lyrics'),
    ('kara_artists')
) AS t(table_name);
