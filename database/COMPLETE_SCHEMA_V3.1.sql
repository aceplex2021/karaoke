-- ============================================
-- COMPLETE DATABASE SCHEMA v3.1
-- ============================================
-- Date: 2026-01-19
-- Purpose: Complete schema for karaoke app after migration
-- Includes: All tables, functions, indexes, RLS policies
--
-- This is a reference schema - DO NOT RUN on existing database
-- Use this as documentation and for fresh database setup
-- ============================================

-- ============================================
-- 1. CORE TABLES
-- ============================================

-- Languages (reference table)
CREATE TABLE IF NOT EXISTS kara_languages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(10) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default languages if not exist
INSERT INTO kara_languages (code, name) VALUES ('vi', 'Vietnamese'), ('en', 'English')
ON CONFLICT (code) DO NOTHING;

-- Users (anonymous + authenticated)
CREATE TABLE IF NOT EXISTS kara_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint VARCHAR(255) UNIQUE,
  auth_user_id UUID,
  display_name VARCHAR(255),
  preferred_language VARCHAR(10) DEFAULT 'en',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_fingerprint ON kara_users(fingerprint);
CREATE INDEX IF NOT EXISTS idx_users_auth_user_id ON kara_users(auth_user_id);

-- ============================================
-- 2. SONG SCHEMA (NEW SIMPLIFIED)
-- ============================================

-- Song groups (optional, for UI grouping)
CREATE TABLE IF NOT EXISTS kara_song_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  base_title_unaccent TEXT NOT NULL UNIQUE,
  base_title_display TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_groups_base_title ON kara_song_groups(base_title_unaccent);

-- Versions (MAIN TABLE - each version is a unique song variant)
CREATE TABLE IF NOT EXISTS kara_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Optional grouping
  group_id UUID REFERENCES kara_song_groups(id) ON DELETE SET NULL,
  
  -- Title fields
  title_display VARCHAR(500) NOT NULL,
  title_clean VARCHAR(500) NOT NULL,
  normalized_title VARCHAR(500) NOT NULL,
  base_title_unaccent TEXT,
  
  -- Metadata from parseFilename.js
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

-- Indexes
CREATE INDEX IF NOT EXISTS idx_versions_title_display ON kara_versions(title_display);
CREATE INDEX IF NOT EXISTS idx_versions_normalized_title ON kara_versions(normalized_title);
CREATE INDEX IF NOT EXISTS idx_versions_base_title_unaccent ON kara_versions(base_title_unaccent);
CREATE INDEX IF NOT EXISTS idx_versions_tone ON kara_versions(tone);
CREATE INDEX IF NOT EXISTS idx_versions_mixer ON kara_versions(mixer);
CREATE INDEX IF NOT EXISTS idx_versions_style ON kara_versions(style);
CREATE INDEX IF NOT EXISTS idx_versions_artist_name ON kara_versions(artist_name);
CREATE INDEX IF NOT EXISTS idx_versions_performance_type ON kara_versions(performance_type);
CREATE INDEX IF NOT EXISTS idx_versions_group_id ON kara_versions(group_id);
CREATE INDEX IF NOT EXISTS idx_versions_language_id ON kara_versions(language_id);
CREATE INDEX IF NOT EXISTS idx_versions_title_search ON kara_versions 
  USING GIN (to_tsvector('simple', title_display));

-- Files (media files for each version)
CREATE TABLE IF NOT EXISTS kara_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id UUID NOT NULL REFERENCES kara_versions(id) ON DELETE CASCADE,
  
  type VARCHAR(20) NOT NULL CHECK (type IN ('video', 'audio', 'backing', 'lyrics')),
  storage_path VARCHAR(1000) NOT NULL UNIQUE,
  format VARCHAR(10),
  duration_seconds INTEGER,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_files_version_id ON kara_files(version_id);
CREATE INDEX IF NOT EXISTS idx_files_type ON kara_files(type);
CREATE UNIQUE INDEX IF NOT EXISTS idx_files_storage_path ON kara_files(storage_path);

-- ============================================
-- 3. ROOM & QUEUE TABLES
-- ============================================

-- Rooms
CREATE TABLE IF NOT EXISTS kara_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_code VARCHAR(6) UNIQUE NOT NULL,
  room_name VARCHAR(255) NOT NULL,
  host_id UUID REFERENCES kara_users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_active BOOLEAN DEFAULT TRUE,
  subscription_tier VARCHAR(50) DEFAULT 'free',
  expires_at TIMESTAMPTZ,
  current_entry_id UUID,
  last_singer_id UUID REFERENCES kara_users(id),
  queue_mode VARCHAR(20) DEFAULT 'fifo' CHECK (queue_mode IN ('fifo', 'round_robin'))
);

CREATE INDEX IF NOT EXISTS idx_rooms_code ON kara_rooms(room_code);
CREATE INDEX IF NOT EXISTS idx_rooms_host_id ON kara_rooms(host_id);
CREATE INDEX IF NOT EXISTS idx_rooms_current_entry_id ON kara_rooms(current_entry_id);

-- Queue
CREATE TABLE IF NOT EXISTS kara_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES kara_rooms(id) ON DELETE CASCADE,
  version_id UUID NOT NULL REFERENCES kara_versions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES kara_users(id) ON DELETE CASCADE,
  
  position INTEGER NOT NULL,
  status VARCHAR(20) DEFAULT 'pending' 
    CHECK (status IN ('pending', 'playing', 'completed', 'skipped')),
  
  added_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  
  round_number INTEGER DEFAULT 1,
  host_override BOOLEAN DEFAULT false,
  host_override_position INTEGER,
  
  -- Legacy: kept NULL for backward compatibility
  song_id UUID
);

CREATE INDEX IF NOT EXISTS idx_queue_room_id ON kara_queue(room_id);
CREATE INDEX IF NOT EXISTS idx_queue_user_id ON kara_queue(user_id);
CREATE INDEX IF NOT EXISTS idx_queue_version_id ON kara_queue(version_id);
CREATE INDEX IF NOT EXISTS idx_queue_status ON kara_queue(status);
CREATE INDEX IF NOT EXISTS idx_queue_position ON kara_queue(position);
CREATE INDEX IF NOT EXISTS idx_queue_round_number ON kara_queue(round_number);

-- Add foreign key from rooms to queue
ALTER TABLE kara_rooms 
  DROP CONSTRAINT IF EXISTS kara_rooms_current_entry_id_fkey;
ALTER TABLE kara_rooms
  ADD CONSTRAINT kara_rooms_current_entry_id_fkey 
  FOREIGN KEY (current_entry_id) 
  REFERENCES kara_queue(id) 
  ON DELETE SET NULL;

-- Room participants
CREATE TABLE IF NOT EXISTS kara_room_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES kara_rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES kara_users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  last_active_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(room_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_participants_room_id ON kara_room_participants(room_id);
CREATE INDEX IF NOT EXISTS idx_participants_user_id ON kara_room_participants(user_id);

-- ============================================
-- 4. HISTORY & PREFERENCES
-- ============================================

-- Song history (tracks completed songs)
CREATE TABLE IF NOT EXISTS kara_song_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES kara_rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES kara_users(id) ON DELETE CASCADE,
  version_id UUID NOT NULL REFERENCES kara_versions(id) ON DELETE CASCADE,
  sung_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  times_sung INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_history_room_id ON kara_song_history(room_id);
CREATE INDEX IF NOT EXISTS idx_history_user_id ON kara_song_history(user_id);
CREATE INDEX IF NOT EXISTS idx_history_version_id ON kara_song_history(version_id);
CREATE INDEX IF NOT EXISTS idx_history_sung_at ON kara_song_history(sung_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_history_room_user_version 
  ON kara_song_history(room_id, user_id, version_id);

-- User preferences
CREATE TABLE IF NOT EXISTS kara_user_preferences (
  user_id UUID PRIMARY KEY REFERENCES kara_users(id) ON DELETE CASCADE,
  favorite_song_ids TEXT[] DEFAULT '{}',
  default_tone VARCHAR(10),
  default_style VARCHAR(50),
  vocal_range_min VARCHAR(10),
  vocal_range_max VARCHAR(10),
  preferred_mixers TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_prefs_favorite_song_ids ON kara_user_preferences 
  USING GIN (favorite_song_ids);

-- ============================================
-- 5. ROW LEVEL SECURITY (RLS)
-- ============================================

ALTER TABLE kara_song_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable all for authenticated and anon users" ON kara_song_history;
CREATE POLICY "Enable all for authenticated and anon users" 
  ON kara_song_history 
  FOR ALL 
  TO authenticated, anon 
  USING (true) 
  WITH CHECK (true);

-- ============================================
-- 6. POSTGRESQL FUNCTIONS
-- ============================================

-- 6.1: advance_playback (handle song completion and queue progression)
CREATE OR REPLACE FUNCTION advance_playback(p_room_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_current_id UUID;
  v_current_user_id UUID;
  v_current_version_id UUID;
  v_next_id UUID;
  v_queue_mode VARCHAR(20);
  v_existing_history_id UUID;
BEGIN
  -- 1. Get current playing entry
  SELECT id, user_id, version_id 
  INTO v_current_id, v_current_user_id, v_current_version_id
  FROM kara_queue
  WHERE room_id = p_room_id AND status = 'playing'
  LIMIT 1;
  
  -- 2. Mark current as completed and write to history
  IF v_current_id IS NOT NULL THEN
    UPDATE kara_queue
    SET status = 'completed', completed_at = NOW()
    WHERE id = v_current_id;
    
    -- Write to history
    IF v_current_version_id IS NOT NULL AND v_current_user_id IS NOT NULL THEN
      SELECT id INTO v_existing_history_id
      FROM kara_song_history
      WHERE room_id = p_room_id
        AND user_id = v_current_user_id
        AND version_id = v_current_version_id
      LIMIT 1;
      
      IF v_existing_history_id IS NOT NULL THEN
        UPDATE kara_song_history
        SET times_sung = times_sung + 1, sung_at = NOW()
        WHERE id = v_existing_history_id;
      ELSE
        INSERT INTO kara_song_history (room_id, user_id, version_id, sung_at, times_sung)
        VALUES (p_room_id, v_current_user_id, v_current_version_id, NOW(), 1);
      END IF;
    END IF;
  END IF;
  
  -- 3. Get room's queue_mode
  SELECT queue_mode INTO v_queue_mode
  FROM kara_rooms
  WHERE id = p_room_id;
  
  -- 4. Get next pending song
  IF v_queue_mode = 'round_robin' THEN
    SELECT id INTO v_next_id
    FROM kara_queue
    WHERE room_id = p_room_id AND status = 'pending'
    ORDER BY round_number ASC, position ASC
    LIMIT 1;
  ELSE
    SELECT id INTO v_next_id
    FROM kara_queue
    WHERE room_id = p_room_id AND status = 'pending'
    ORDER BY position ASC
    LIMIT 1;
  END IF;
  
  -- 5. Start next song or clear queue
  IF v_next_id IS NOT NULL THEN
    UPDATE kara_queue
    SET status = 'playing', started_at = NOW()
    WHERE id = v_next_id;
    
    UPDATE kara_rooms
    SET current_entry_id = v_next_id, updated_at = NOW()
    WHERE id = p_room_id;
    
    RETURN TRUE;
  ELSE
    UPDATE kara_rooms
    SET current_entry_id = NULL, updated_at = NOW()
    WHERE id = p_room_id;
    
    RETURN FALSE;
  END IF;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION advance_playback(UUID) TO authenticated, anon, service_role;

-- 6.2: host_reorder_queue (host reorders any queue item)
CREATE OR REPLACE FUNCTION host_reorder_queue(
    p_room_id UUID,
    p_queue_item_id UUID,
    p_new_position INTEGER
)
RETURNS BOOLEAN AS $$
DECLARE
    v_lock_key BIGINT;
    v_queue_mode VARCHAR(20);
    v_current_position INTEGER;
    v_current_round_number INTEGER;
    v_min_position INTEGER;
    v_max_position INTEGER;
    v_new_round_number INTEGER;
    v_rows_updated INTEGER;
BEGIN
    v_lock_key := ('x' || substr(md5(p_room_id::text), 1, 16))::bit(64)::bigint;
    PERFORM pg_advisory_xact_lock(v_lock_key);
    
    SELECT queue_mode INTO v_queue_mode
    FROM kara_rooms
    WHERE id = p_room_id;
    
    SELECT position, round_number INTO v_current_position, v_current_round_number
    FROM kara_queue
    WHERE id = p_queue_item_id
    AND room_id = p_room_id
    AND status = 'pending'
    FOR UPDATE;
    
    IF v_current_position IS NULL THEN
        RETURN FALSE;
    END IF;
    
    IF v_current_position = p_new_position THEN
        RETURN TRUE;
    END IF;
    
    SELECT MIN(position), MAX(position) INTO v_min_position, v_max_position
    FROM kara_queue
    WHERE room_id = p_room_id
    AND status = 'pending';
    
    IF p_new_position < v_min_position OR p_new_position > v_max_position THEN
        RETURN FALSE;
    END IF;
    
    IF v_queue_mode = 'round_robin' THEN
        SELECT round_number INTO v_new_round_number
        FROM kara_queue
        WHERE room_id = p_room_id
        AND status = 'pending'
        AND position = p_new_position
        LIMIT 1;
        
        IF v_new_round_number IS NULL THEN
            v_new_round_number := v_current_round_number;
        END IF;
    ELSE
        v_new_round_number := 1;
    END IF;
    
    IF v_current_position < p_new_position THEN
        IF v_queue_mode = 'round_robin' THEN
            UPDATE kara_queue
            SET position = position - 1
            WHERE room_id = p_room_id
            AND status = 'pending'
            AND position > v_current_position
            AND position <= p_new_position;
        ELSE
            UPDATE kara_queue
            SET position = position - 1
            WHERE room_id = p_room_id
            AND status = 'pending'
            AND position > v_current_position
            AND position <= p_new_position;
        END IF;
    ELSE
        UPDATE kara_queue
        SET position = position + 1
        WHERE room_id = p_room_id
        AND status = 'pending'
        AND position >= p_new_position
        AND position < v_current_position;
    END IF;
    
    IF v_queue_mode = 'round_robin' THEN
        UPDATE kara_queue
        SET position = p_new_position, round_number = v_new_round_number
        WHERE id = p_queue_item_id
        AND room_id = p_room_id;
    ELSE
        UPDATE kara_queue
        SET position = p_new_position
        WHERE id = p_queue_item_id
        AND room_id = p_room_id;
    END IF;
    
    GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
    
    IF v_rows_updated = 1 THEN
        RETURN TRUE;
    ELSE
        RETURN FALSE;
    END IF;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION host_reorder_queue(UUID, UUID, INTEGER) TO authenticated, anon, service_role;

-- 6.3: user_reorder_queue (user reorders their own queue items)
CREATE OR REPLACE FUNCTION user_reorder_queue(
    p_queue_item_id UUID,
    p_user_id UUID,
    p_direction VARCHAR(4)
)
RETURNS BOOLEAN AS $$
DECLARE
    v_lock_key BIGINT;
    v_queue_item RECORD;
    v_room_id UUID;
    v_queue_mode VARCHAR(20);
    v_current_index INTEGER;
    v_target_index INTEGER;
    v_target_song RECORD;
    v_temp_position INTEGER;
    v_temp_round_number INTEGER;
    v_user_song_ids UUID[];
    v_total_count INTEGER;
BEGIN
    SELECT * INTO v_queue_item
    FROM kara_queue
    WHERE id = p_queue_item_id
    AND user_id = p_user_id
    AND status = 'pending'
    FOR UPDATE;
    
    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;
    
    v_room_id := v_queue_item.room_id;
    
    SELECT queue_mode INTO v_queue_mode
    FROM kara_rooms
    WHERE id = v_room_id;
    
    v_lock_key := ('x' || substr(md5(v_room_id::text), 1, 16))::bit(64)::bigint;
    PERFORM pg_advisory_xact_lock(v_lock_key);
    
    SELECT ARRAY_AGG(id ORDER BY position) INTO v_user_song_ids
    FROM kara_queue
    WHERE room_id = v_room_id
    AND user_id = p_user_id
    AND status = 'pending';
    
    IF v_user_song_ids IS NULL OR array_length(v_user_song_ids, 1) IS NULL THEN
        RETURN FALSE;
    END IF;
    
    v_total_count := array_length(v_user_song_ids, 1);
    v_current_index := array_position(v_user_song_ids, p_queue_item_id);
    
    IF v_current_index IS NULL THEN
        RETURN FALSE;
    END IF;
    
    IF p_direction = 'up' THEN
        v_target_index := v_current_index - 1;
        IF v_target_index < 1 THEN
            RETURN FALSE;
        END IF;
    ELSIF p_direction = 'down' THEN
        v_target_index := v_current_index + 1;
        IF v_target_index > v_total_count THEN
            RETURN FALSE;
        END IF;
    ELSE
        RETURN FALSE;
    END IF;
    
    SELECT * INTO v_target_song
    FROM kara_queue
    WHERE id = v_user_song_ids[v_target_index]
    AND room_id = v_room_id
    AND user_id = p_user_id
    AND status = 'pending'
    FOR UPDATE;
    
    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;
    
    v_temp_position := v_queue_item.position;
    v_temp_round_number := v_queue_item.round_number;
    
    IF v_queue_mode = 'round_robin' THEN
        UPDATE kara_queue 
        SET position = 2147483647, round_number = 2147483647 
        WHERE id = p_queue_item_id;
        
        UPDATE kara_queue 
        SET position = v_temp_position, round_number = v_temp_round_number 
        WHERE id = v_target_song.id;
        
        UPDATE kara_queue 
        SET position = v_target_song.position, round_number = v_target_song.round_number 
        WHERE id = p_queue_item_id;
    ELSE
        UPDATE kara_queue SET position = 2147483647 WHERE id = p_queue_item_id;
        UPDATE kara_queue SET position = v_temp_position WHERE id = v_target_song.id;
        UPDATE kara_queue SET position = v_target_song.position WHERE id = p_queue_item_id;
    END IF;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION user_reorder_queue(UUID, UUID, VARCHAR) TO authenticated, anon, service_role;

-- ============================================
-- 7. VERIFICATION QUERIES
-- ============================================

-- Check all tables exist
SELECT 
  table_name,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t.table_name) as column_count
FROM information_schema.tables t
WHERE table_schema = 'public' 
  AND table_name LIKE 'kara_%'
  AND table_type = 'BASE TABLE'
ORDER BY table_name;

-- Check all functions exist
SELECT routine_name, routine_type 
FROM information_schema.routines 
WHERE routine_schema = 'public'
  AND routine_name IN ('advance_playback', 'host_reorder_queue', 'user_reorder_queue')
ORDER BY routine_name;

-- Expected output:
-- kara_files             | 7 columns
-- kara_languages         | 4 columns
-- kara_queue             | 14 columns
-- kara_room_participants | 5 columns
-- kara_rooms             | 11 columns
-- kara_song_groups       | 4 columns
-- kara_song_history      | 8 columns
-- kara_user_preferences  | 9 columns
-- kara_users             | 7 columns
-- kara_versions          | 18 columns
--
-- advance_playback      | function
-- host_reorder_queue    | function
-- user_reorder_queue    | function
