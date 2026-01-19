-- ============================================
-- DATABASE REVAMP - NUCLEAR OPTION
-- ============================================
-- Date: 2026-01-18
-- Strategy: Clean slate - drop everything, rebuild simplified schema
-- WARNING: This deletes ALL data (users, rooms, queues, songs)
-- Files on TrueNAS are preserved and will be re-scanned

-- ============================================
-- STEP 1: TRUNCATE ALL TABLES (DELETE DATA)
-- ============================================

BEGIN;

-- Delete ALL data from ALL tables
TRUNCATE TABLE kara_queue CASCADE;
TRUNCATE TABLE kara_room_participants CASCADE;
TRUNCATE TABLE kara_rooms CASCADE;
TRUNCATE TABLE kara_users CASCADE;
TRUNCATE TABLE kara_user_preferences CASCADE;

-- These will be dropped anyway, but truncate for safety
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'kara_song_history') THEN
    TRUNCATE TABLE kara_song_history CASCADE;
  END IF;
END $$;

COMMIT;

-- ============================================
-- STEP 2: DROP ALL VIEWS
-- ============================================

BEGIN;

DROP VIEW IF EXISTS kara_song_versions_detail_view CASCADE;
DROP VIEW IF EXISTS kara_song_versions_view CASCADE;
DROP VIEW IF EXISTS kara_files_with_title_norm CASCADE;
DROP VIEW IF EXISTS kara_files_with_title_clean CASCADE;
DROP VIEW IF EXISTS kara_files_parsed_preview CASCADE;

COMMIT;

-- ============================================
-- STEP 3: DROP OLD TABLES
-- ============================================

BEGIN;

-- Drop join tables first (foreign key dependencies)
DROP TABLE IF EXISTS kara_song_group_members CASCADE;

-- Drop old song/version/file tables
DROP TABLE IF EXISTS kara_songs CASCADE;
DROP TABLE IF EXISTS kara_song_history CASCADE;
DROP TABLE IF EXISTS kara_files CASCADE;
DROP TABLE IF EXISTS kara_versions CASCADE;

-- Truncate groups (will reuse this table)
TRUNCATE TABLE kara_song_groups CASCADE;

COMMIT;

-- ============================================
-- STEP 4: CREATE NEW SIMPLIFIED SCHEMA
-- ============================================

BEGIN;

-- ============================================
-- 4.1: kara_song_groups (optional, for UI grouping)
-- ============================================

-- Table already exists, ensure it has correct structure
CREATE TABLE IF NOT EXISTS kara_song_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  base_title_unaccent TEXT NOT NULL UNIQUE,
  base_title_display TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_groups_base_title ON kara_song_groups(base_title_unaccent);

COMMENT ON TABLE kara_song_groups IS 'Optional grouping for UI to show "X versions of this song"';
COMMENT ON COLUMN kara_song_groups.base_title_unaccent IS 'Normalized, unaccented base title for grouping (e.g., "khi da yeu")';
COMMENT ON COLUMN kara_song_groups.base_title_display IS 'Display version with proper capitalization (e.g., "Khi Đã Yêu")';

-- ============================================
-- 4.2: kara_versions (MAIN TABLE - ALL METADATA)
-- ============================================

CREATE TABLE kara_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Optional grouping (for UI showing "3 versions of this song")
  group_id UUID REFERENCES kara_song_groups(id) ON DELETE SET NULL,
  
  -- Title fields (from parseFilename-enhanced.js)
  title_display VARCHAR(500) NOT NULL,
  title_clean VARCHAR(500) NOT NULL,
  normalized_title VARCHAR(500) NOT NULL,
  base_title_unaccent TEXT,
  
  -- Metadata (from parseFilename-enhanced.js)
  tone VARCHAR(50),                              -- 'Nam', 'Nữ', or null
  mixer VARCHAR(255),                            -- Kim Quy, Trọng Hiếu, Gia Huy, etc.
  style VARCHAR(255),                            -- Ballad, Bolero, Beat, Nhạc Sống, etc.
  artist_name VARCHAR(500),                      -- Trịnh Công Sơn, Duy Mạnh, etc.
  performance_type VARCHAR(50) DEFAULT 'solo' 
    CHECK (performance_type IN ('solo', 'duet', 'group', 'medley')),
  is_tram BOOLEAN DEFAULT false,                 -- Low pitch/register
  
  -- Musical metadata (from parseFilename-enhanced.js)
  key VARCHAR(50),                               -- C, G#m, Ebm, etc.
  tempo INTEGER,                                 -- BPM (optional)
  label VARCHAR(255),                            -- Computed: "nam_ballad_tram"
  
  -- System fields
  language_id UUID NOT NULL REFERENCES kara_languages(id),
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Uniqueness: same title + language + label = same version
  UNIQUE(normalized_title, language_id, label)
);

-- Indexes for fast search
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
COMMENT ON TABLE kara_versions IS 'Main table: each row = unique version (tone + mixer + style). This is the atomic unit for search.';
COMMENT ON COLUMN kara_versions.tone IS 'Voice gender: Nam (male), Nữ (female), or null (instrumental/unknown)';
COMMENT ON COLUMN kara_versions.mixer IS 'Channel/mixer name dynamically loaded from channelSources.md';
COMMENT ON COLUMN kara_versions.style IS 'Musical style: Ballad, Bolero, Beat, Nhạc Sống, Cha Cha, etc.';
COMMENT ON COLUMN kara_versions.artist_name IS 'Composer/artist name extracted from filename (parentheses, dash patterns, etc.)';
COMMENT ON COLUMN kara_versions.performance_type IS 'Solo (1 singer), duet (2), group (3+), or medley (multiple songs)';
COMMENT ON COLUMN kara_versions.label IS 'Computed label: tone_style_tram (e.g., "nam_ballad_tram")';
COMMENT ON COLUMN kara_versions.is_tram IS 'Low pitch/register indicator';

-- ============================================
-- 4.3: kara_files (media files for each version)
-- ============================================

CREATE TABLE kara_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id UUID NOT NULL REFERENCES kara_versions(id) ON DELETE CASCADE,
  
  type VARCHAR(20) NOT NULL CHECK (type IN ('video', 'audio', 'backing', 'lyrics')),
  storage_path VARCHAR(1000) NOT NULL UNIQUE,
  format VARCHAR(10),                            -- mp4, mp3, etc.
  duration_seconds INTEGER,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_files_version_id ON kara_files(version_id);
CREATE INDEX idx_files_type ON kara_files(type);
CREATE UNIQUE INDEX idx_files_storage_path ON kara_files(storage_path);

-- Comments
COMMENT ON TABLE kara_files IS 'Media files (video, audio, backing tracks, lyrics) for each version';
COMMENT ON COLUMN kara_files.type IS 'File type: video (main karaoke), audio (audio-only), backing (instrumental), lyrics (text)';
COMMENT ON COLUMN kara_files.storage_path IS 'Path to file on TrueNAS (e.g., /Videos/Song_Title__nam.mp4)';

COMMIT;

-- ============================================
-- STEP 5: VERIFY MIGRATION
-- ============================================

-- Check table counts (should be 0 for all)
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

-- Expected output: all counts should be 0

-- Check for old tables (should return 0 rows)
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN ('kara_songs', 'kara_song_group_members', 'kara_song_history')
ORDER BY table_name;

-- Expected output: (empty - no rows)

-- Check for old views (should return 0 rows)
SELECT table_name 
FROM information_schema.views 
WHERE table_schema = 'public' 
  AND table_name LIKE '%song%version%'
ORDER BY table_name;

-- Expected output: (empty - no rows)

-- Verify new columns exist in kara_versions
SELECT column_name, data_type, character_maximum_length
FROM information_schema.columns 
WHERE table_name = 'kara_versions' 
  AND column_name IN ('tone', 'mixer', 'style', 'artist_name', 'performance_type', 'is_tram')
ORDER BY column_name;

-- Expected output:
-- artist_name      | character varying | 500
-- is_tram          | boolean          | (null)
-- mixer            | character varying | 255
-- performance_type | character varying | 50
-- style            | character varying | 255
-- tone             | character varying | 50

-- List all remaining kara_* tables (should be minimal)
SELECT table_name, table_type
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name LIKE 'kara_%'
ORDER BY table_name;

-- Expected output:
-- kara_files               | BASE TABLE
-- kara_languages           | BASE TABLE
-- kara_queue               | BASE TABLE
-- kara_room_participants   | BASE TABLE
-- kara_rooms               | BASE TABLE
-- kara_song_groups         | BASE TABLE
-- kara_user_preferences    | BASE TABLE
-- kara_users               | BASE TABLE
-- kara_versions            | BASE TABLE

-- ============================================
-- MIGRATION COMPLETE!
-- ============================================

-- Summary of changes:
-- ✅ Deleted: All data from all tables
-- ✅ Dropped: kara_songs, kara_song_group_members, kara_song_history
-- ✅ Dropped: All kara_*_view views (5 views)
-- ✅ Created: New kara_versions (with 18 columns including all metadata)
-- ✅ Created: New kara_files (clean structure)
-- ✅ Kept: kara_song_groups (for UI grouping)
-- ✅ Kept: kara_users, kara_rooms, kara_queue (empty but structure intact)

-- Next steps:
-- 1. Update Node Controller (dbUpsert-enhanced.js)
-- 2. Deploy to TrueNAS
-- 3. Re-scan files to populate kara_versions
-- 4. Update frontend APIs
-- 5. Test search functionality
