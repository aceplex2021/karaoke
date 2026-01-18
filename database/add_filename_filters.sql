-- Fix: Apply all Phase B database changes
-- Run this in Supabase SQL Editor to ensure all Phase B features are enabled

-- ============================================
-- 1. Add missing columns to kara_rooms
-- ============================================

DROP VIEW IF EXISTS kara_files_parsed_preview;
CREATE OR REPLACE VIEW kara_files_parsed_preview AS
SELECT
  id,
  storage_path,

  -- Normalize filename
  regexp_replace(storage_path, '^.*/|\.mp4$', '', 'gi') AS filename,

  -- ARTIST / COMPOSER (text inside first parentheses)
  NULLIF(
    trim((regexp_match(storage_path, '\(([^)]+)\)'))[1]),
    ''
  ) AS artist,

  -- TONE / GENDER
  CASE
    WHEN storage_path ~* 'tone\s*nữ|__nu' THEN 'Nữ'
    WHEN storage_path ~* 'tone\s*nam|__nam' THEN 'Nam'
    WHEN storage_path ~* 'song\s*ca|__song_ca' THEN 'Song ca'
    ELSE NULL
  END AS tone,

  -- MUSICAL KEY
  (regexp_match(storage_path, '\(([A-G][#b]?[mM]?)'))[1] AS key,

  -- STYLE / TEMPO
  CASE
    WHEN storage_path ~* 'slow|ballad' THEN 'Ballad'
    WHEN storage_path ~* 'bolero' THEN 'Bolero'
    WHEN storage_path ~* 'remix' THEN 'Remix'
    WHEN storage_path ~* 'nhạc sống' THEN 'Nhạc sống'
    ELSE NULL
  END AS style,

  -- MIXER / CHANNEL
  CASE
    WHEN storage_path ~* 'kim\s*quy' THEN 'Kim Quy'
    WHEN storage_path ~* 'hiếu|hieu' THEN 'Hiếu Organ'
    WHEN storage_path ~* 'trọng\s*hiếu' THEN 'Trọng Hiếu'
    WHEN storage_path ~* 'yêu\s*ca\s*hát|love\s*singing' THEN 'Yêu Ca Hát'
    ELSE NULL
  END AS mixer,

  -- VERSION TYPE
  CASE
    WHEN storage_path ~* 'beat\s*chuẩn|âm\s*thanh\s*chuẩn' THEN 'Beat Chuẩn'
    WHEN storage_path ~* 'beat\s*gốc' THEN 'Beat Gốc'
    WHEN storage_path ~* 'acoustic' THEN 'Acoustic'
    ELSE NULL
  END AS version_type

FROM kara_files;
