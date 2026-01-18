-- ============================================
-- KARAOKE APPLICATION - CANONICAL DATABASE SCHEMA
-- ============================================
-- Generated: 2026-01-17
-- Updated: 2026-01-17 (removed kara_artists, kara_lyrics, kara_tags, kara_song_tags)
-- Based on: Actual production database analysis
-- Status: Reflects current production state
--
-- This schema matches the ACTUAL database structure.
-- Use this as the source of truth for development.
-- ============================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- ============================================
-- CORE TABLES
-- ============================================

-- Users table
CREATE TABLE IF NOT EXISTS kara_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint VARCHAR UNIQUE,
  auth_user_id UUID,
  display_name VARCHAR,
  preferred_language VARCHAR,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_users_fingerprint ON kara_users(fingerprint);

COMMENT ON TABLE kara_users IS 'User accounts for the karaoke application';
COMMENT ON COLUMN kara_users.fingerprint IS 'Browser fingerprint for anonymous users';
COMMENT ON COLUMN kara_users.auth_user_id IS 'Link to Supabase auth.users if authenticated';

-- ============================================
-- ROOM MANAGEMENT
-- ============================================

-- Rooms table
CREATE TABLE IF NOT EXISTS kara_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_code VARCHAR NOT NULL UNIQUE,
  room_name VARCHAR NOT NULL,
  host_id UUID REFERENCES kara_users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_active BOOLEAN DEFAULT true,
  subscription_tier VARCHAR DEFAULT 'free',
  expires_at TIMESTAMPTZ,
  current_entry_id UUID, -- FK added after kara_queue is created
  last_singer_id UUID REFERENCES kara_users(id),
  queue_mode VARCHAR DEFAULT 'round_robin' CHECK (queue_mode IN ('round_robin', 'first_come', 'host_control'))
);

CREATE INDEX IF NOT EXISTS idx_rooms_code ON kara_rooms(room_code);
CREATE INDEX IF NOT EXISTS idx_rooms_host ON kara_rooms(host_id);

COMMENT ON TABLE kara_rooms IS 'Karaoke rooms/sessions';
COMMENT ON COLUMN kara_rooms.queue_mode IS 'How songs are ordered: round_robin, first_come, or host_control';
COMMENT ON COLUMN kara_rooms.current_entry_id IS 'Currently playing queue item';

-- Room participants
CREATE TABLE IF NOT EXISTS kara_room_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES kara_rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES kara_users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  last_active_at TIMESTAMPTZ DEFAULT NOW(),
  role VARCHAR DEFAULT 'participant' CHECK (role IN ('host', 'participant', 'viewer')),
  UNIQUE(room_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_participants_room ON kara_room_participants(room_id);
CREATE INDEX IF NOT EXISTS idx_participants_user ON kara_room_participants(user_id);

COMMENT ON TABLE kara_room_participants IS 'Tracks who is in each room';

-- ============================================
-- SONG CATALOG (NEW SCHEMA)
-- ============================================

-- Song groups (base titles)
CREATE TABLE IF NOT EXISTS kara_song_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  base_title_unaccent TEXT NOT NULL UNIQUE,
  base_title_display TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS kara_song_groups_base_uidx ON kara_song_groups(base_title_unaccent);

COMMENT ON TABLE kara_song_groups IS 'Groups songs by their base title (ignoring tone/mixer/style variants)';
COMMENT ON COLUMN kara_song_groups.base_title_unaccent IS 'Normalized, unaccented base title used for grouping';
COMMENT ON COLUMN kara_song_groups.base_title_display IS 'Display version of base title (with proper capitalization)';

-- Versions table
CREATE TABLE IF NOT EXISTS kara_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  song_id UUID NOT NULL, -- References kara_songs (legacy schema)
  key VARCHAR, -- Musical key (e.g., "C", "G#")
  tempo INTEGER, -- BPM
  label VARCHAR, -- Human-readable label (e.g., "Nam - Hieu Organ - Nhac Song")
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(song_id, label)
);

CREATE INDEX IF NOT EXISTS idx_versions_song_id ON kara_versions(song_id);

COMMENT ON TABLE kara_versions IS 'Different versions of songs (variations in tone, mixer, style)';
COMMENT ON COLUMN kara_versions.label IS 'Human-readable version label extracted from filename';
COMMENT ON COLUMN kara_versions.is_default IS 'Whether this is the default/recommended version';

-- Files table (media files for each version)
CREATE TABLE IF NOT EXISTS kara_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id UUID NOT NULL REFERENCES kara_versions(id) ON DELETE CASCADE,
  type VARCHAR NOT NULL CHECK (type IN ('video', 'audio', 'backing', 'lyrics')),
  storage_path VARCHAR NOT NULL UNIQUE,
  format VARCHAR, -- File extension (mp4, mp3, etc.)
  duration_seconds INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_files_version_id ON kara_files(version_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_kara_files_storage_path ON kara_files(storage_path);

COMMENT ON TABLE kara_files IS 'Media files associated with song versions';
COMMENT ON COLUMN kara_files.storage_path IS 'Path to file in storage system (TrueNAS/media server)';
COMMENT ON COLUMN kara_files.type IS 'Type of file: video (main), audio (audio-only), backing (instrumental), lyrics';

-- ============================================
-- LEGACY SONG SCHEMA (KEPT FOR COMPATIBILITY)
-- ============================================

-- Languages table
CREATE TABLE IF NOT EXISTS kara_languages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR NOT NULL UNIQUE,
  name VARCHAR NOT NULL
);

CREATE INDEX IF NOT EXISTS kara_languages_code_key ON kara_languages(code);

COMMENT ON TABLE kara_languages IS 'Language codes for songs (e.g., vi, en, zh)';

-- Legacy songs table
CREATE TABLE IF NOT EXISTS kara_songs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR NOT NULL,
  artist_id UUID, -- No FK constraint (kara_artists table dropped)
  language_id UUID REFERENCES kara_languages(id),
  duration INTEGER,
  bpm INTEGER,
  default_key VARCHAR,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Search fields
  search_vector TSVECTOR,
  normalized_title VARCHAR,
  title_display VARCHAR,
  search_title TEXT,
  search_title_unaccent TEXT,
  base_title TEXT,
  base_title_unaccent TEXT,
  
  UNIQUE(normalized_title, language_id)
);

CREATE INDEX IF NOT EXISTS idx_songs_search ON kara_songs USING GIN(search_vector);
CREATE INDEX IF NOT EXISTS idx_songs_artist_id ON kara_songs(artist_id);
CREATE INDEX IF NOT EXISTS idx_songs_language_id ON kara_songs(language_id);
CREATE INDEX IF NOT EXISTS kara_songs_normalized_title_idx ON kara_songs(normalized_title);
CREATE INDEX IF NOT EXISTS kara_songs_search_title_unaccent_idx ON kara_songs(search_title_unaccent);
CREATE INDEX IF NOT EXISTS kara_songs_base_title_unaccent_idx ON kara_songs(base_title_unaccent);

COMMENT ON TABLE kara_songs IS 'Legacy song catalog. Being phased out in favor of kara_song_groups.';

-- Add FK from versions to songs
ALTER TABLE kara_versions ADD CONSTRAINT kara_versions_song_id_fkey 
  FOREIGN KEY (song_id) REFERENCES kara_songs(id) ON DELETE CASCADE;

-- Song group members (links songs to groups)
CREATE TABLE IF NOT EXISTS kara_song_group_members (
  group_id UUID NOT NULL REFERENCES kara_song_groups(id) ON DELETE CASCADE,
  song_id UUID NOT NULL REFERENCES kara_songs(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (group_id, song_id)
);

CREATE INDEX IF NOT EXISTS kara_song_group_members_song_idx ON kara_song_group_members(song_id);

COMMENT ON TABLE kara_song_group_members IS 'Many-to-many relationship: songs to groups';

-- ============================================
-- QUEUE MANAGEMENT
-- ============================================

CREATE TABLE IF NOT EXISTS kara_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES kara_rooms(id) ON DELETE CASCADE,
  song_id UUID REFERENCES kara_songs(id), -- Legacy: may be null
  version_id UUID REFERENCES kara_versions(id), -- New: specific version
  user_id UUID NOT NULL REFERENCES kara_users(id),
  position INTEGER NOT NULL,
  status VARCHAR DEFAULT 'pending' CHECK (status IN ('pending', 'playing', 'completed', 'skipped')),
  added_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  
  -- Round-robin support
  round_number INTEGER,
  
  -- Host override for manual reordering
  host_override BOOLEAN DEFAULT false,
  host_override_position INTEGER
);

CREATE INDEX IF NOT EXISTS idx_queue_room ON kara_queue(room_id);
CREATE INDEX IF NOT EXISTS idx_queue_status ON kara_queue(status);
CREATE INDEX IF NOT EXISTS idx_queue_position ON kara_queue(room_id, position);
CREATE UNIQUE INDEX IF NOT EXISTS idx_queue_one_playing_per_room ON kara_queue(room_id) 
  WHERE status = 'playing';

COMMENT ON TABLE kara_queue IS 'Song queue for each room';
COMMENT ON COLUMN kara_queue.version_id IS 'Specific version selected by user';
COMMENT ON COLUMN kara_queue.song_id IS 'Legacy field, may be null';
COMMENT ON COLUMN kara_queue.round_number IS 'Round number in round-robin mode';
COMMENT ON COLUMN kara_queue.host_override IS 'True if host manually reordered this item';

-- Add FK from rooms to queue
ALTER TABLE kara_rooms ADD CONSTRAINT kara_rooms_current_entry_id_fkey 
  FOREIGN KEY (current_entry_id) REFERENCES kara_queue(id) ON DELETE SET NULL;

-- ============================================
-- HISTORY & PREFERENCES
-- ============================================

-- Song history
CREATE TABLE IF NOT EXISTS kara_song_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES kara_rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES kara_users(id),
  song_id UUID NOT NULL REFERENCES kara_songs(id),
  sung_at TIMESTAMPTZ DEFAULT NOW(),
  times_sung INTEGER DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_history_room_user ON kara_song_history(room_id, user_id);
CREATE INDEX IF NOT EXISTS idx_history_user_song ON kara_song_history(user_id, song_id);

COMMENT ON TABLE kara_song_history IS 'Tracks which users have sung which songs';

-- User preferences
CREATE TABLE IF NOT EXISTS kara_user_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES kara_users(id) ON DELETE CASCADE,
  preferred_language VARCHAR(10) DEFAULT 'en',
  preferred_version_type VARCHAR(20),
  auto_add_favorite BOOLEAN DEFAULT false,
  favorite_song_ids JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_preferences_user ON kara_user_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_user_preferences_favorite_song_ids ON kara_user_preferences USING GIN(favorite_song_ids);

COMMENT ON TABLE kara_user_preferences IS 'User settings and preferences';
COMMENT ON COLUMN kara_user_preferences.favorite_song_ids IS 'Array of favorite song IDs stored as JSONB';

-- ============================================
-- VIEWS FOR SEARCH & DISPLAY
-- ============================================

-- Search view: Groups songs by base title, counts versions
CREATE OR REPLACE VIEW kara_song_versions_view AS
SELECT 
  g.id AS group_id,
  LOWER(COALESCE(g.base_title_display, g.base_title_unaccent)) AS song_title,
  COUNT(DISTINCT v.id) AS version_count
FROM kara_files f
JOIN kara_versions v ON f.version_id = v.id
JOIN kara_songs s ON v.song_id = s.id
JOIN kara_song_group_members m ON s.id = m.song_id
JOIN kara_song_groups g ON m.group_id = g.id
WHERE f.type = 'video'
GROUP BY g.id, g.base_title_display, g.base_title_unaccent
ORDER BY song_title;

COMMENT ON VIEW kara_song_versions_view IS 'Search results: groups songs by title, shows version count';

-- Detail view: Extracts version details from file paths
CREATE OR REPLACE VIEW kara_song_versions_detail_view AS
SELECT 
  f.id,
  f.version_id,
  g.id AS group_id,
  LOWER(COALESCE(g.base_title_display, g.base_title_unaccent)) AS song_title,
  f.storage_path,
  CASE 
    WHEN f.storage_path ~ 'Tone\s+Nam' OR f.storage_path ~ 'Nam\s+-' THEN 'Nam'
    WHEN f.storage_path ~ 'Tone\s+Nu' OR f.storage_path ~ 'Nu\s+-' THEN 'Nu'
    ELSE 'Unknown'
  END AS tone,
  TRIM(REGEXP_REPLACE(
    REGEXP_REPLACE(f.storage_path, '.*(?:Mixer|Mix)\s+([^-|]+).*', '\1'),
    '[()]', '', 'g'
  )) AS mixer,
  TRIM(REGEXP_REPLACE(
    REGEXP_REPLACE(f.storage_path, '.*(?:Style|Phong Cach)\s+([^-|()]+).*', '\1'),
    '[()]', '', 'g'
  )) AS style,
  -- Extract artist from path
  TRIM(REGEXP_REPLACE(
    f.storage_path,
    '.*[/\\]([^/\\]+)[/\\][^/\\]*\.(mp4|mkv|avi|mov|wmv)$',
    '\1'
  )) AS artist
FROM kara_files f
JOIN kara_versions v ON f.version_id = v.id
JOIN kara_songs s ON v.song_id = s.id
JOIN kara_song_group_members m ON s.id = m.song_id
JOIN kara_song_groups g ON m.group_id = g.id
WHERE f.type = 'video';

COMMENT ON VIEW kara_song_versions_detail_view IS 'Version details: extracts tone/mixer/style/artist from file paths';

-- Helper view: Normalized file titles
CREATE OR REPLACE VIEW kara_files_with_title_norm AS
SELECT 
  k.*,
  TRIM(REGEXP_REPLACE(
    LOWER(UNACCENT(REGEXP_REPLACE(
      k.storage_path, 
      '^.*[/\\]([^/\\]+)\.(mp4|mkv|avi|mov|wmv)$', 
      '\1'
    ))),
    '\s+', ' ', 'g'
  )) AS title_norm
FROM kara_files k;

COMMENT ON VIEW kara_files_with_title_norm IS 'Helper: adds normalized title field to files';

-- Helper view: Cleaned file titles (removes metadata)
CREATE OR REPLACE VIEW kara_files_with_title_clean AS
SELECT 
  kara_files_with_title_norm.*,
  TRIM(REGEXP_REPLACE(
    REGEXP_REPLACE(
      REGEXP_REPLACE(
        REGEXP_REPLACE(
          REGEXP_REPLACE(
            REGEXP_REPLACE(
              REGEXP_REPLACE(
                REGEXP_REPLACE(
                  title_norm,
                  '\s*\([^)]*\)\s*', ' ', 'g'
                ),
                '\s*tone\s+(nam|nu)\s*', ' ', 'gi'
              ),
              '\s*(mixer?|mix)\s+[^\-|]+', ' ', 'gi'
            ),
            '\s*(style|phong cach)\s+[^\-|]+', ' ', 'gi'
          ),
          '\s*[\-|]+\s*', ' ', 'g'
        ),
        '  +', ' ', 'g'
      ),
      '^\s+|\s+$', '', 'g'
    ),
    '\s+', ' ', 'g'
  )) AS title_clean
FROM kara_files_with_title_norm;

COMMENT ON VIEW kara_files_with_title_clean IS 'Helper: removes tone/mixer/style metadata from titles';

-- Preview view: Parsed file metadata
CREATE OR REPLACE VIEW kara_files_parsed_preview AS
SELECT 
  id,
  storage_path,
  title_norm,
  CASE 
    WHEN storage_path ~ 'Tone\s+Nam' OR storage_path ~ 'Nam\s+-' THEN 'Nam'
    WHEN storage_path ~ 'Tone\s+Nu' OR storage_path ~ 'Nu\s+-' THEN 'Nu'
    ELSE NULL
  END AS tone,
  TRIM(REGEXP_REPLACE(
    REGEXP_REPLACE(storage_path, '.*(?:Mixer|Mix)\s+([^-|]+).*', '\1'),
    '[()]', '', 'g'
  )) AS mixer,
  TRIM(REGEXP_REPLACE(
    REGEXP_REPLACE(storage_path, '.*(?:Style|Phong Cach)\s+([^-|()]+).*', '\1'),
    '[()]', '', 'g'
  )) AS style
FROM kara_files_with_title_norm
WHERE type = 'video';

COMMENT ON VIEW kara_files_parsed_preview IS 'Debug/preview: shows parsed metadata from file paths';

-- ============================================
-- INDEXES & CONSTRAINTS SUMMARY
-- ============================================

-- Total indexes: ~50+
-- All foreign keys have supporting indexes
-- Full-text search indexes on kara_songs.search_vector
-- Unique constraints prevent duplicates
-- Partial indexes for performance (e.g., idx_queue_one_playing_per_room)

-- ============================================
-- SCHEMA VERSION & NOTES
-- ============================================

COMMENT ON SCHEMA public IS 'Karaoke Application Schema v2.1 - Updated 2026-01-17';

-- Schema evolution notes:
-- - New schema: kara_song_groups, kara_versions, kara_files (group-based search)
-- - Legacy schema: kara_songs (kept for compatibility)
-- - Dropped tables: kara_artists, kara_lyrics, kara_tags, kara_song_tags (removed 2026-01-17)
-- - Search uses views to bridge old and new schemas
-- - File paths contain metadata (tone/mixer/style) extracted via regex in views
