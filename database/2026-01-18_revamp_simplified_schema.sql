-- ============================================
-- DATABASE REVAMP MIGRATION
-- ============================================
-- Date: 2026-01-18
-- Purpose: Simplify schema, align with parseFilename-enhanced.js
-- Strategy: See options below (choose ONE)

-- ============================================
-- OPTION 1: NUCLEAR (Clean Slate)
-- ============================================
-- Use this for: Dev/staging, small user base, no critical data
-- Result: ALL data deleted, fresh start

BEGIN;

-- Delete all data from all tables
TRUNCATE TABLE kara_queue CASCADE;
TRUNCATE TABLE kara_room_participants CASCADE;
TRUNCATE TABLE kara_rooms CASCADE;
TRUNCATE TABLE kara_users CASCADE;
TRUNCATE TABLE kara_user_preferences CASCADE;
TRUNCATE TABLE kara_song_history CASCADE;

-- Drop old song/version structures
DROP VIEW IF EXISTS kara_song_versions_detail_view CASCADE;
DROP VIEW IF EXISTS kara_song_versions_view CASCADE;
DROP VIEW IF EXISTS kara_files_with_title_norm CASCADE;
DROP VIEW IF EXISTS kara_files_with_title_clean CASCADE;
DROP VIEW IF EXISTS kara_files_parsed_preview CASCADE;

DROP TABLE IF EXISTS kara_song_group_members CASCADE;
DROP TABLE IF EXISTS kara_songs CASCADE;
DROP TABLE IF EXISTS kara_song_history CASCADE;
DROP TABLE IF EXISTS kara_files CASCADE;
DROP TABLE IF EXISTS kara_versions CASCADE;

-- Keep kara_song_groups (will be repopulated)
TRUNCATE TABLE kara_song_groups CASCADE;

COMMIT;

-- ============================================
-- OPTION 2: SELECTIVE (Preserve Users/Rooms)
-- ============================================
-- Use this for: Production, active users, preserve identity
-- Result: Users/rooms kept, queues wiped

BEGIN;

-- Delete only song-dependent data
TRUNCATE TABLE kara_queue CASCADE;
TRUNCATE TABLE kara_song_history CASCADE;

-- Reset room states (remove references to deleted queue items)
UPDATE kara_rooms 
SET current_entry_id = NULL,
    last_singer_id = NULL,
    updated_at = NOW();

-- Drop old song/version structures (same as Option 1)
DROP VIEW IF EXISTS kara_song_versions_detail_view CASCADE;
DROP VIEW IF EXISTS kara_song_versions_view CASCADE;
DROP VIEW IF EXISTS kara_files_with_title_norm CASCADE;
DROP VIEW IF EXISTS kara_files_with_title_clean CASCADE;
DROP VIEW IF EXISTS kara_files_parsed_preview CASCADE;

DROP TABLE IF EXISTS kara_song_group_members CASCADE;
DROP TABLE IF EXISTS kara_songs CASCADE;
DROP TABLE IF EXISTS kara_song_history CASCADE;
DROP TABLE IF EXISTS kara_files CASCADE;
DROP TABLE IF EXISTS kara_versions CASCADE;

-- Keep kara_song_groups (will be repopulated)
TRUNCATE TABLE kara_song_groups CASCADE;

COMMIT;

-- ============================================
-- AFTER CHOOSING OPTION 1 OR 2: CREATE NEW SCHEMA
-- ============================================

BEGIN;

-- Create kara_song_groups (if not exists)
CREATE TABLE IF NOT EXISTS kara_song_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  base_title_unaccent TEXT NOT NULL UNIQUE,
  base_title_display TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_groups_base_title ON kara_song_groups(base_title_unaccent);

-- Create new kara_versions (MAIN TABLE)
CREATE TABLE kara_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Optional grouping
  group_id UUID REFERENCES kara_song_groups(id) ON DELETE SET NULL,
  
  -- Title fields
  title_display VARCHAR(500) NOT NULL,
  title_clean VARCHAR(500) NOT NULL,
  normalized_title VARCHAR(500) NOT NULL,
  base_title_unaccent TEXT,
  
  -- Metadata from parseFilename-enhanced.js
  tone VARCHAR(50),
  mixer VARCHAR(255),
  style VARCHAR(255),
  artist_name VARCHAR(500),
  performance_type VARCHAR(50) DEFAULT 'solo' 
    CHECK (performance_type IN ('solo', 'duet', 'group', 'medley')),
  is_tram BOOLEAN DEFAULT false,
  
  -- Musical metadata
  key VARCHAR(50),
  tempo INTEGER,
  label VARCHAR(255),
  
  -- System fields
  language_id UUID NOT NULL REFERENCES kara_languages(id),
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(normalized_title, language_id, label)
);

-- Indexes for search performance
CREATE INDEX idx_versions_title_display ON kara_versions(title_display);
CREATE INDEX idx_versions_normalized_title ON kara_versions(normalized_title);
CREATE INDEX idx_versions_base_title_unaccent ON kara_versions(base_title_unaccent);
CREATE INDEX idx_versions_tone ON kara_versions(tone);
CREATE INDEX idx_versions_mixer ON kara_versions(mixer);
CREATE INDEX idx_versions_style ON kara_versions(style);
CREATE INDEX idx_versions_artist_name ON kara_versions(artist_name);
CREATE INDEX idx_versions_performance_type ON kara_versions(performance_type);
CREATE INDEX idx_versions_group_id ON kara_versions(group_id);
CREATE INDEX idx_versions_language_id ON kara_versions(language_id);

-- Full-text search index
CREATE INDEX idx_versions_title_search ON kara_versions 
  USING GIN (to_tsvector('simple', title_display));

-- Comments
COMMENT ON TABLE kara_versions IS 'Each row = unique version (tone + mixer + style). Atomic unit for search.';
COMMENT ON COLUMN kara_versions.tone IS 'Voice gender: Nam (male), Nữ (female), or null';
COMMENT ON COLUMN kara_versions.mixer IS 'Channel/mixer name from channelSources.md';
COMMENT ON COLUMN kara_versions.style IS 'Musical style: Ballad, Bolero, Beat, Nhạc Sống, etc.';
COMMENT ON COLUMN kara_versions.artist_name IS 'Composer/artist extracted from filename';
COMMENT ON COLUMN kara_versions.performance_type IS 'Solo, duet, group, or medley';
COMMENT ON COLUMN kara_versions.label IS 'Computed: tone_style_tram (e.g., "nam_ballad_tram")';

-- Create new kara_files
CREATE TABLE kara_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id UUID NOT NULL REFERENCES kara_versions(id) ON DELETE CASCADE,
  
  type VARCHAR(20) NOT NULL CHECK (type IN ('video', 'audio', 'backing', 'lyrics')),
  storage_path VARCHAR(1000) NOT NULL UNIQUE,
  format VARCHAR(10),
  duration_seconds INTEGER,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_files_version_id ON kara_files(version_id);
CREATE INDEX idx_files_type ON kara_files(type);
CREATE UNIQUE INDEX idx_files_storage_path ON kara_files(storage_path);

-- Comments
COMMENT ON TABLE kara_files IS 'Media files (video, audio, backing, lyrics) for each version';
COMMENT ON COLUMN kara_files.type IS 'File type: video (main), audio, backing, lyrics';

COMMIT;

-- ============================================
-- VERIFY MIGRATION
-- ============================================

-- Check table counts (should be 0 for versions/files)
SELECT 'kara_versions' as table_name, COUNT(*) as count FROM kara_versions
UNION ALL
SELECT 'kara_files', COUNT(*) FROM kara_files
UNION ALL
SELECT 'kara_song_groups', COUNT(*) FROM kara_song_groups
UNION ALL
SELECT 'kara_users', COUNT(*) FROM kara_users
UNION ALL
SELECT 'kara_rooms', COUNT(*) FROM kara_rooms
UNION ALL
SELECT 'kara_queue', COUNT(*) FROM kara_queue;

-- Check for old tables (should return 0 rows)
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN ('kara_songs', 'kara_song_group_members')
ORDER BY table_name;

-- Check for old views (should return 0 rows)
SELECT table_name 
FROM information_schema.views 
WHERE table_schema = 'public' 
  AND table_name LIKE '%song%'
ORDER BY table_name;

-- Verify new columns exist
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'kara_versions' 
  AND column_name IN ('tone', 'mixer', 'style', 'artist_name', 'performance_type')
ORDER BY column_name;

-- Expected output:
-- artist_name    | character varying
-- mixer          | character varying
-- performance_type | character varying
-- style          | character varying
-- tone           | character varying
