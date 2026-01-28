-- ============================================
-- COMPLETE DATABASE SCHEMA v5.0
-- ============================================
-- Date: 2026-01-24
-- Purpose: Complete current schema snapshot for v5.0
-- Status: REFERENCE ONLY - Represents actual database state
-- 
-- This is a snapshot of the current production database at v5.0.
-- Includes all changes from v4.8 through v5.0:
-- - Room expiry fixes (default expires_at, scheduled jobs)
-- - Primary TV reassignment (connected_tv_ids, set_primary_tv function)
-- - Stale participations cleanup (cleanup_stale_participations function)
-- 
-- DO NOT RUN on existing database - for reference only
-- ============================================

-- ============================================
-- 1. CORE TABLES
-- ============================================

-- Languages (reference table)
CREATE TABLE IF NOT EXISTS kara_languages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(10) UNIQUE NOT NULL,
  name VARCHAR(50) NOT NULL
);

-- Insert default languages
INSERT INTO kara_languages (code, name) VALUES ('vi', 'Vietnamese'), ('en', 'English')
ON CONFLICT (code) DO NOTHING;

-- Users (anonymous + authenticated)
CREATE TABLE IF NOT EXISTS kara_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint VARCHAR(255) UNIQUE,
  auth_user_id UUID,  -- For Supabase Auth integration (v5.0: will be used for authentication)
  display_name VARCHAR(255),
  preferred_language VARCHAR(10) DEFAULT 'en',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_fingerprint ON kara_users(fingerprint);

-- ============================================
-- 2. SONG SCHEMA
-- ============================================

-- Song groups (for UI grouping)
CREATE TABLE IF NOT EXISTS kara_song_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  base_title_unaccent TEXT NOT NULL UNIQUE,
  base_title_display TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_groups_base_title ON kara_song_groups(base_title_unaccent);
CREATE UNIQUE INDEX IF NOT EXISTS kara_song_groups_base_uidx ON kara_song_groups(base_title_unaccent);

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
  is_active BOOLEAN DEFAULT true,
  
  -- Payment & subscription fields (v5.0: reserved for future use)
  subscription_tier VARCHAR(50) DEFAULT 'free',
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '24 hours'),  -- v5.0: Default value added
  
  -- Queue state
  current_entry_id UUID,  -- FK to kara_queue (added below)
  last_singer_id UUID REFERENCES kara_users(id) ON DELETE SET NULL,
  queue_mode VARCHAR(20) DEFAULT 'fifo' CHECK (queue_mode IN ('fifo', 'round_robin')),
  
  -- v4.0+ features
  approval_mode TEXT DEFAULT 'auto' CHECK (approval_mode IN ('auto', 'approval')),
  
  -- v4.3+ TV sync
  primary_tv_id UUID,
  current_song_started_at TIMESTAMPTZ,
  
  -- v5.0: Connected TVs tracking
  connected_tv_ids JSONB DEFAULT '[]'::jsonb  -- Array of connected TV IDs for dropdown selection
);

CREATE INDEX IF NOT EXISTS idx_rooms_code ON kara_rooms(room_code);
CREATE INDEX IF NOT EXISTS idx_rooms_host ON kara_rooms(host_id);
CREATE INDEX IF NOT EXISTS idx_rooms_primary_tv ON kara_rooms(primary_tv_id);
CREATE INDEX IF NOT EXISTS idx_rooms_connected_tv_ids ON kara_rooms USING GIN (connected_tv_ids);  -- v5.0: JSONB index

-- Queue (v4.0+: supports YouTube + database songs)
CREATE TABLE IF NOT EXISTS kara_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES kara_rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES kara_users(id) ON DELETE CASCADE,
  
  -- Song reference (database or YouTube)
  version_id UUID REFERENCES kara_versions(id) ON DELETE CASCADE,  -- For database songs
  youtube_url TEXT,  -- v4.0: For YouTube songs
  source_type TEXT DEFAULT 'database' CHECK (source_type IN ('database', 'youtube')),
  metadata JSONB DEFAULT '{}',  -- v4.0: Store YouTube metadata
  
  -- Legacy field (kept for backward compatibility)
  song_id UUID,
  
  -- Queue position
  position INTEGER NOT NULL,
  sort_key NUMERIC NOT NULL DEFAULT 1000.0,  -- v4.7: For efficient reordering
  status VARCHAR(20) DEFAULT 'pending',
  
  -- Timestamps
  added_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  
  -- Round-robin support
  round_number INTEGER DEFAULT 1,
  
  -- Host override support
  host_override BOOLEAN DEFAULT false,
  host_override_position INTEGER,
  
  -- Constraint: Must have either version_id (database) OR youtube_url (YouTube)
  CONSTRAINT check_queue_source CHECK (
    (source_type = 'database' AND version_id IS NOT NULL AND youtube_url IS NULL) OR
    (source_type = 'youtube' AND youtube_url IS NOT NULL AND version_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_queue_room ON kara_queue(room_id);
CREATE INDEX IF NOT EXISTS idx_queue_status ON kara_queue(status);
CREATE INDEX IF NOT EXISTS idx_queue_position ON kara_queue(room_id, position);
CREATE INDEX IF NOT EXISTS idx_queue_sort_key ON kara_queue(room_id, status, sort_key);
CREATE INDEX IF NOT EXISTS idx_queue_metadata ON kara_queue USING GIN (metadata);

-- v4.7: Ensure only one song playing per room
CREATE UNIQUE INDEX IF NOT EXISTS idx_queue_one_playing_per_room 
  ON kara_queue(room_id) WHERE status = 'playing';

-- Add foreign key from rooms to queue
ALTER TABLE kara_rooms 
  DROP CONSTRAINT IF EXISTS kara_rooms_current_entry_id_fkey;
ALTER TABLE kara_rooms
  ADD CONSTRAINT kara_rooms_current_entry_id_fkey 
  FOREIGN KEY (current_entry_id) 
  REFERENCES kara_queue(id) 
  ON DELETE SET NULL;

-- Room participants (v4.0+: approval support)
CREATE TABLE IF NOT EXISTS kara_room_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES kara_rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES kara_users(id) ON DELETE CASCADE,
  user_name VARCHAR(255),  -- Cached for display
  
  -- Timestamps
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  last_active_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- v4.0: Approval system
  role VARCHAR(20) DEFAULT 'participant',  -- 'participant' | 'host' | 'tv' | 'user'
  status TEXT DEFAULT 'approved' CHECK (status IN ('approved', 'pending', 'denied')),
  approved_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,  -- For pending approval expiry
  
  UNIQUE(room_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_participants_room ON kara_room_participants(room_id);
CREATE INDEX IF NOT EXISTS idx_participants_user ON kara_room_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_participants_role ON kara_room_participants(role);
CREATE INDEX IF NOT EXISTS idx_participants_status ON kara_room_participants(status);

-- ============================================
-- 4. HISTORY & PREFERENCES
-- ============================================

-- Song history (tracks completed songs)
-- v4.5.2: User-global (not room-specific)
CREATE TABLE IF NOT EXISTS kara_song_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES kara_rooms(id) ON DELETE CASCADE,  -- Shows where last sung
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

-- v4.5.2: User-global history (unique per user + song, not room)
CREATE UNIQUE INDEX IF NOT EXISTS idx_history_user_version 
  ON kara_song_history(user_id, version_id);

-- User preferences
CREATE TABLE IF NOT EXISTS kara_user_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES kara_users(id) ON DELETE CASCADE,
  
  -- General preferences
  preferred_language VARCHAR(10) DEFAULT 'en',
  preferred_version_type VARCHAR(20),
  auto_add_favorite BOOLEAN DEFAULT false,
  
  -- Favorites (v4.0+: JSONB format for database + YouTube songs)
  favorite_song_ids JSONB DEFAULT '[]',
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_preferences_user ON kara_user_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_user_preferences_favorite_song_ids 
  ON kara_user_preferences USING GIN (favorite_song_ids);

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
    
    -- Write to history (user-global, v4.5.2)
    IF v_current_version_id IS NOT NULL AND v_current_user_id IS NOT NULL THEN
      SELECT id INTO v_existing_history_id
      FROM kara_song_history
      WHERE user_id = v_current_user_id
        AND version_id = v_current_version_id
      LIMIT 1;
      
      IF v_existing_history_id IS NOT NULL THEN
        UPDATE kara_song_history
        SET times_sung = times_sung + 1, 
            sung_at = NOW(),
            room_id = p_room_id,  -- Update to most recent room
            updated_at = NOW()
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
    SET current_entry_id = v_next_id, 
        current_song_started_at = NOW(),
        updated_at = NOW()
    WHERE id = p_room_id;
    
    RETURN TRUE;
  ELSE
    UPDATE kara_rooms
    SET current_entry_id = NULL, 
        current_song_started_at = NULL,
        updated_at = NOW()
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

-- 6.4: expire_old_rooms (v5.0: Phase 1 - Room expiry)
CREATE OR REPLACE FUNCTION expire_old_rooms()
RETURNS void AS $$
BEGIN
  UPDATE kara_rooms
  SET is_active = false
  WHERE expires_at < NOW()
  AND is_active = true;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION expire_old_rooms() TO authenticated, anon, service_role;

-- 6.5: set_primary_tv (v5.0: Host can reassign primary TV)
CREATE OR REPLACE FUNCTION set_primary_tv(
  p_room_id UUID,
  p_user_id UUID,
  p_tv_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  v_host_id UUID;
  v_connected_tvs JSONB;
BEGIN
  -- Get host_id for the room
  SELECT host_id, connected_tv_ids INTO v_host_id, v_connected_tvs
  FROM kara_rooms
  WHERE id = p_room_id;
  
  -- Verify user is host
  IF v_host_id IS NULL OR v_host_id != p_user_id THEN
    RAISE EXCEPTION 'Only host can change primary TV';
  END IF;
  
  -- Verify TV is in connected list (optional check - allows setting any TV)
  -- If connected_tv_ids is empty or null, allow any TV ID
  IF v_connected_tvs IS NOT NULL AND jsonb_array_length(v_connected_tvs) > 0 THEN
    IF NOT (v_connected_tvs ? p_tv_id) THEN
      -- TV not in connected list, but allow anyway (host can set any TV)
      -- Optionally add it to the list
      v_connected_tvs := v_connected_tvs || jsonb_build_array(p_tv_id);
    END IF;
  ELSE
    -- No connected TVs yet, initialize with this TV
    v_connected_tvs := jsonb_build_array(p_tv_id);
  END IF;
  
  -- Update primary_tv_id and connected_tv_ids
  UPDATE kara_rooms
  SET primary_tv_id = p_tv_id,
      connected_tv_ids = v_connected_tvs,
      updated_at = NOW()
  WHERE id = p_room_id;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION set_primary_tv(UUID, UUID, UUID) TO authenticated, anon, service_role;

COMMENT ON FUNCTION set_primary_tv IS 
  'Allows host to change primary_tv_id. Verifies host_id before updating. Adds TV to connected list if not present. Returns true on success, raises exception if not host.';

-- 6.6: add_connected_tv (v5.0: Track connected TVs when they register)
CREATE OR REPLACE FUNCTION add_connected_tv(
  p_room_id UUID,
  p_tv_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  v_connected_tvs JSONB;
BEGIN
  -- Get current connected TVs
  SELECT COALESCE(connected_tv_ids, '[]'::jsonb) INTO v_connected_tvs
  FROM kara_rooms
  WHERE id = p_room_id;
  
  -- Add TV if not already in list
  IF NOT (v_connected_tvs ? p_tv_id) THEN
    v_connected_tvs := v_connected_tvs || jsonb_build_array(p_tv_id);
    
    -- Update room
    UPDATE kara_rooms
    SET connected_tv_ids = v_connected_tvs,
        updated_at = NOW()
    WHERE id = p_room_id;
  END IF;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION add_connected_tv(UUID, UUID) TO authenticated, anon, service_role;

COMMENT ON FUNCTION add_connected_tv IS 
  'Adds a TV ID to the connected_tv_ids array when TV registers. Called by register-tv API.';

-- 6.7: cleanup_stale_participations (v4.9: Phase 2.1 - Clean up stale participations)
CREATE OR REPLACE FUNCTION cleanup_stale_participations()
RETURNS TABLE(deleted_count INTEGER) AS $$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  -- Delete stale participations (>24 hours inactive)
  -- Never remove hosts (they own the room)
  WITH deleted AS (
    DELETE FROM kara_room_participants
    WHERE status = 'approved'
    AND role != 'host'  -- Never remove hosts
    AND (
      last_active_at IS NULL 
      OR last_active_at < NOW() - INTERVAL '24 hours'
    )
    RETURNING id
  )
  SELECT COUNT(*) INTO v_deleted_count FROM deleted;
  
  RETURN QUERY SELECT v_deleted_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_stale_participations IS 'Phase 2.1: Remove participations inactive >24 hours (safety net for users who forget to leave)';

GRANT EXECUTE ON FUNCTION cleanup_stale_participations() TO authenticated, anon, service_role;

-- 6.8: kara_songs_set_base_fields (helper function for song metadata)
-- Note: This function exists in production but implementation not shown in schema queries
-- It's likely used by the Controller/scanVideos.js for setting base_title_unaccent

-- ============================================
-- 7. COMMENTS & DOCUMENTATION
-- ============================================

COMMENT ON COLUMN kara_rooms.connected_tv_ids IS 
  'Array of connected TV IDs. Format: ["tv-id-1", "tv-id-2", ...]. Updated when TVs register/disconnect.';

COMMENT ON COLUMN kara_rooms.expires_at IS 
  'Room expiration timestamp. Defaults to 24 hours after creation. Rooms are automatically marked inactive when expired.';

-- ============================================
-- 8. VERIFICATION QUERIES
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

-- Expected output (v5.0):
-- kara_files             | 7 columns
-- kara_languages         | 3 columns
-- kara_queue             | 17 columns (youtube_url, source_type, metadata, sort_key)
-- kara_room_participants | 10 columns (role, status, approved_at, expires_at, user_name)
-- kara_rooms             | 16 columns (added connected_tv_ids, expires_at has default)
-- kara_song_groups       | 4 columns
-- kara_song_history      | 8 columns
-- kara_user_preferences  | 8 columns (favorite_song_ids is JSONB)
-- kara_users             | 7 columns
-- kara_versions          | 19 columns

-- Check all functions exist
SELECT routine_name, routine_type 
FROM information_schema.routines 
WHERE routine_schema = 'public'
  AND routine_name IN (
    'advance_playback', 
    'host_reorder_queue', 
    'user_reorder_queue', 
    'expire_old_rooms',
    'set_primary_tv',
    'add_connected_tv',
    'cleanup_stale_participations',
    'kara_songs_set_base_fields'
  )
ORDER BY routine_name;

-- Expected output (v5.0):
-- add_connected_tv           | function
-- advance_playback            | function
-- cleanup_stale_participations| function
-- expire_old_rooms            | function
-- host_reorder_queue          | function
-- kara_songs_set_base_fields  | function
-- set_primary_tv              | function
-- user_reorder_queue          | function

-- ============================================
-- 9. SCHEDULED JOBS (pg_cron)
-- ============================================
-- Note: These are set up via v5.0_fix_room_expiry.sql and v4.9_cleanup_stale_participations.sql
-- 
-- Expected scheduled jobs:
-- 1. expire-old-rooms: Runs hourly to expire rooms where expires_at < NOW()
-- 2. cleanup-stale-participations: Runs hourly to clean up stale participations
--
-- To verify:
-- SELECT jobid, schedule, command, active 
-- FROM cron.job 
-- WHERE jobname IN ('expire-old-rooms', 'cleanup-stale-participations');
-- ============================================
