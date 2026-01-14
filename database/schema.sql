-- Karaoke Web App Database Schema
-- Tables prefixed with kara_* per project convention
-- IMPORTANT: Tables must be created in dependency order

-- Users table (anonymous + authenticated) - Created first (no dependencies)
CREATE TABLE IF NOT EXISTS kara_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Anonymous users identified by browser fingerprint/UUID
    fingerprint VARCHAR(255) UNIQUE,
    -- Optional: Supabase auth user_id
    auth_user_id UUID,
    display_name VARCHAR(255),
    preferred_language VARCHAR(10) DEFAULT 'en',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(fingerprint)
);

-- Songs table (indexed from filesystem) - Created second (no dependencies)
CREATE TABLE IF NOT EXISTS kara_songs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(500) NOT NULL,
    artist VARCHAR(255),
    language VARCHAR(10) DEFAULT 'en',
    youtube_id VARCHAR(50),
    file_path VARCHAR(1000) NOT NULL, -- Relative path on TrueNAS
    duration INTEGER, -- Duration in seconds
    created_at TIMESTAMPTZ DEFAULT NOW(),
    -- Full-text search support
    search_vector tsvector GENERATED ALWAYS AS (
        to_tsvector('english', coalesce(title, '') || ' ' || coalesce(artist, ''))
    ) STORED
);

-- Rooms table - Created third (depends on kara_users)
-- Note: current_entry_id FK will be added after kara_queue table exists
CREATE TABLE IF NOT EXISTS kara_rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_code VARCHAR(6) UNIQUE NOT NULL,
    -- 6-character room code (e.g., ABC123)
    room_name VARCHAR(255) NOT NULL,
    host_id UUID REFERENCES kara_users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    is_active BOOLEAN DEFAULT TRUE,
    -- Future-proofing for paid rooms
    subscription_tier VARCHAR(50) DEFAULT 'free',
    expires_at TIMESTAMPTZ,
    -- Backend-controlled playback: current playing queue entry
    -- FK constraint added after kara_queue table exists (see end of file)
    current_entry_id UUID,
    -- Round-robin cursor: last singer who had a turn
    last_singer_id UUID REFERENCES kara_users(id) ON DELETE SET NULL,
    -- Queue ordering mode: round_robin (fair rotation) or fifo (first come first serve)
    queue_mode VARCHAR(20) DEFAULT 'fifo' CHECK (queue_mode IN ('round_robin', 'fifo')),
    UNIQUE(room_code)
);

-- Queue table
CREATE TABLE IF NOT EXISTS kara_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES kara_rooms(id) ON DELETE CASCADE,
    song_id UUID NOT NULL REFERENCES kara_songs(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES kara_users(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    status VARCHAR(20) DEFAULT 'pending', -- pending, playing, completed, skipped
    added_at TIMESTAMPTZ DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    -- For fair rotation: track which round this belongs to
    round_number INTEGER DEFAULT 1,
    -- Host can override order
    host_override BOOLEAN DEFAULT FALSE,
    host_override_position INTEGER
);

-- Song history (what users sang in which rooms)
CREATE TABLE IF NOT EXISTS kara_song_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES kara_rooms(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES kara_users(id) ON DELETE CASCADE,
    song_id UUID NOT NULL REFERENCES kara_songs(id) ON DELETE CASCADE,
    sung_at TIMESTAMPTZ DEFAULT NOW(),
    -- Track how many times user sang this song in this room
    times_sung INTEGER DEFAULT 1
);

-- Room participants (track who's in which room)
CREATE TABLE IF NOT EXISTS kara_room_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES kara_rooms(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES kara_users(id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    last_active_at TIMESTAMPTZ DEFAULT NOW(),
    role VARCHAR(20) DEFAULT 'participant', -- participant, host
    UNIQUE(room_id, user_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_rooms_code ON kara_rooms(room_code);
CREATE INDEX IF NOT EXISTS idx_rooms_host ON kara_rooms(host_id);
CREATE INDEX IF NOT EXISTS idx_users_fingerprint ON kara_users(fingerprint);
CREATE INDEX IF NOT EXISTS idx_songs_search ON kara_songs USING GIN(search_vector);
CREATE INDEX IF NOT EXISTS idx_songs_language ON kara_songs(language);
CREATE INDEX IF NOT EXISTS idx_queue_room ON kara_queue(room_id);
CREATE INDEX IF NOT EXISTS idx_queue_status ON kara_queue(status);
CREATE INDEX IF NOT EXISTS idx_queue_position ON kara_queue(room_id, position);
CREATE INDEX IF NOT EXISTS idx_history_room_user ON kara_song_history(room_id, user_id);
CREATE INDEX IF NOT EXISTS idx_history_user_song ON kara_song_history(user_id, song_id);
CREATE INDEX IF NOT EXISTS idx_participants_room ON kara_room_participants(room_id);
CREATE INDEX IF NOT EXISTS idx_participants_user ON kara_room_participants(user_id);

-- Phase B: Enforce "one playing per room" invariant
-- Partial unique index: only one row per room can have status='playing'
CREATE UNIQUE INDEX IF NOT EXISTS idx_queue_one_playing_per_room 
ON kara_queue(room_id) 
WHERE status = 'playing';

-- Add FK constraint for current_entry_id after kara_queue exists
-- This avoids circular dependency during table creation
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'kara_rooms_current_entry_id_fkey'
    ) THEN
        ALTER TABLE kara_rooms
        ADD CONSTRAINT kara_rooms_current_entry_id_fkey
        FOREIGN KEY (current_entry_id) 
        REFERENCES kara_queue(id) 
        ON DELETE SET NULL;
    END IF;
END $$;

-- Function to generate unique room code
CREATE OR REPLACE FUNCTION generate_room_code()
RETURNS VARCHAR(6) AS $$
DECLARE
    chars VARCHAR := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- Exclude confusing chars
    result VARCHAR(6) := '';
    i INTEGER;
BEGIN
    FOR i IN 1..6 LOOP
        result := result || substr(chars, floor(random() * length(chars) + 1)::INTEGER, 1);
    END LOOP;
    
    -- Check if code already exists
    WHILE EXISTS (SELECT 1 FROM kara_rooms WHERE room_code = result) LOOP
        result := '';
        FOR i IN 1..6 LOOP
            result := result || substr(chars, floor(random() * length(chars) + 1)::INTEGER, 1);
        END LOOP;
    END LOOP;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Phase B: Atomic playback transition function
-- Uses advisory lock to serialize transitions per room
-- Ensures exactly one playing entry per room
CREATE OR REPLACE FUNCTION transition_playback(
    p_room_id UUID,
    p_current_entry_id UUID,
    p_new_status VARCHAR(20), -- 'completed', 'skipped', or 'error'
    p_next_entry_id UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_lock_key BIGINT;
    v_actual_current_entry_id UUID;
    v_next_entry_id UUID;
    v_user_id UUID;
    v_rows_updated INTEGER;
BEGIN
    -- Use room_id as advisory lock key (hash to BIGINT)
    v_lock_key := ('x' || substr(md5(p_room_id::text), 1, 16))::bit(64)::bigint;
    
    -- Acquire advisory lock for this room (blocks concurrent transitions)
    PERFORM pg_advisory_xact_lock(v_lock_key);
    
    -- Verify current_entry_id matches (idempotency check)
    SELECT current_entry_id INTO v_actual_current_entry_id
    FROM kara_rooms
    WHERE id = p_room_id
    FOR UPDATE; -- Lock room row
    
    -- Idempotency: if entry already processed, return current entry
    IF v_actual_current_entry_id IS NULL OR v_actual_current_entry_id != p_current_entry_id THEN
        -- Entry already processed or not current, return current entry
        RETURN v_actual_current_entry_id;
    END IF;
    
    -- Verify entry is actually playing
    IF NOT EXISTS (
        SELECT 1 FROM kara_queue 
        WHERE id = p_current_entry_id 
        AND room_id = p_room_id 
        AND status = 'playing'
    ) THEN
        -- Entry not playing, return current entry (idempotent)
        RETURN v_actual_current_entry_id;
    END IF;
    
    -- Get user_id before updating
    SELECT user_id INTO v_user_id
    FROM kara_queue
    WHERE id = p_current_entry_id;
    
    -- Mark current entry as completed/skipped/error
    -- Validate that exactly one row was updated
    UPDATE kara_queue
    SET 
        status = p_new_status,
        completed_at = NOW()
    WHERE id = p_current_entry_id
    AND room_id = p_room_id
    AND status = 'playing';
    
    GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
    
    -- If no row updated, entry already processed (idempotent)
    IF v_rows_updated = 0 THEN
        RETURN v_actual_current_entry_id;
    END IF;
    
    -- Update last_singer_id for round-robin
    UPDATE kara_rooms
    SET 
        last_singer_id = v_user_id,
        current_entry_id = NULL,
        updated_at = NOW()
    WHERE id = p_room_id;
    
    -- If next entry provided, start it
    IF p_next_entry_id IS NOT NULL THEN
        -- Verify no other entry is playing (DB constraint will enforce)
        -- Validate that exactly one row moved to playing
        UPDATE kara_queue
        SET 
            status = 'playing',
            started_at = NOW()
        WHERE id = p_next_entry_id
        AND room_id = p_room_id
        AND status = 'pending';
        
        GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
        
        -- Only update room pointer if exactly one row moved to playing
        IF v_rows_updated = 1 THEN
            UPDATE kara_rooms
            SET 
                current_entry_id = p_next_entry_id,
                updated_at = NOW()
            WHERE id = p_room_id;
            
            v_next_entry_id := p_next_entry_id;
        ELSE
            -- Next entry failed to start (maybe already playing or not pending)
            -- Don't update room pointer
            v_next_entry_id := NULL;
        END IF;
    END IF;
    
    RETURN v_next_entry_id;
END;
$$ LANGUAGE plpgsql;

-- Phase B: Atomic start playback function
CREATE OR REPLACE FUNCTION start_playback(
    p_room_id UUID,
    p_entry_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
    v_lock_key BIGINT;
    v_current_entry_id UUID;
    v_rows_updated INTEGER;
BEGIN
    -- Use room_id as advisory lock key
    v_lock_key := ('x' || substr(md5(p_room_id::text), 1, 16))::bit(64)::bigint;
    
    -- Acquire advisory lock
    PERFORM pg_advisory_xact_lock(v_lock_key);
    
    -- Check if room already has a playing entry
    SELECT current_entry_id INTO v_current_entry_id
    FROM kara_rooms
    WHERE id = p_room_id
    FOR UPDATE;
    
    -- If already playing, fail (DB constraint will also prevent)
    IF v_current_entry_id IS NOT NULL THEN
        RETURN FALSE;
    END IF;
    
    -- Start playback (DB constraint ensures only one playing)
    -- Validate that exactly one row moved to playing
    UPDATE kara_queue
    SET 
        status = 'playing',
        started_at = NOW()
    WHERE id = p_entry_id
    AND room_id = p_room_id
    AND status = 'pending';
    
    GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
    
    -- Only update room pointer if exactly one row moved to playing
    IF v_rows_updated = 1 THEN
        UPDATE kara_rooms
        SET 
            current_entry_id = p_entry_id,
            updated_at = NOW()
        WHERE id = p_room_id;
        
        RETURN TRUE;
    ELSE
        -- No row updated or multiple rows (shouldn't happen)
        RETURN FALSE;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Phase B: Atomic host reorder queue function
-- Allows host to reorder queue items by changing their position
-- Uses advisory lock to prevent race conditions
CREATE OR REPLACE FUNCTION host_reorder_queue(
    p_room_id UUID,
    p_queue_item_id UUID,
    p_new_position INTEGER
)
RETURNS BOOLEAN AS $$
DECLARE
    v_lock_key BIGINT;
    v_current_position INTEGER;
    v_min_position INTEGER;
    v_max_position INTEGER;
    v_rows_updated INTEGER;
BEGIN
    -- Use room_id as advisory lock key
    v_lock_key := ('x' || substr(md5(p_room_id::text), 1, 16))::bit(64)::bigint;
    
    -- Acquire advisory lock
    PERFORM pg_advisory_xact_lock(v_lock_key);
    
    -- Get current position of the item to reorder
    SELECT position INTO v_current_position
    FROM kara_queue
    WHERE id = p_queue_item_id
    AND room_id = p_room_id
    AND status = 'pending'  -- Can only reorder pending items (not playing/completed/skipped)
    FOR UPDATE;
    
    -- If item not found or not pending, fail
    IF v_current_position IS NULL THEN
        RETURN FALSE;
    END IF;
    
    -- If already at target position, succeed (idempotent)
    IF v_current_position = p_new_position THEN
        RETURN TRUE;
    END IF;
    
    -- Get min and max positions for this room (pending items only)
    SELECT MIN(position), MAX(position) INTO v_min_position, v_max_position
    FROM kara_queue
    WHERE room_id = p_room_id
    AND status = 'pending';
    
    -- Validate new position is within bounds
    IF p_new_position < v_min_position OR p_new_position > v_max_position THEN
        RETURN FALSE;
    END IF;
    
    -- Reorder: shift positions
    IF v_current_position < p_new_position THEN
        -- Moving down: shift items between current and new position up by 1
        UPDATE kara_queue
        SET position = position - 1
        WHERE room_id = p_room_id
        AND status = 'pending'
        AND position > v_current_position
        AND position <= p_new_position;
    ELSE
        -- Moving up: shift items between new and current position down by 1
        UPDATE kara_queue
        SET position = position + 1
        WHERE room_id = p_room_id
        AND status = 'pending'
        AND position >= p_new_position
        AND position < v_current_position;
    END IF;
    
    -- Update the target item to new position
    UPDATE kara_queue
    SET position = p_new_position
    WHERE id = p_queue_item_id
    AND room_id = p_room_id;
    
    GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
    
    -- Verify update succeeded
    IF v_rows_updated = 1 THEN
        RETURN TRUE;
    ELSE
        RETURN FALSE;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Trigger for rooms updated_at
CREATE TRIGGER update_rooms_updated_at
    BEFORE UPDATE ON kara_rooms
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security (RLS) - can be configured per table
ALTER TABLE kara_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE kara_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE kara_songs ENABLE ROW LEVEL SECURITY;
ALTER TABLE kara_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE kara_song_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE kara_room_participants ENABLE ROW LEVEL SECURITY;

-- Basic RLS policies (allow all for now, can be restricted later)
CREATE POLICY "Allow all on rooms" ON kara_rooms FOR ALL USING (true);
CREATE POLICY "Allow all on users" ON kara_users FOR ALL USING (true);
CREATE POLICY "Allow all on songs" ON kara_songs FOR ALL USING (true);
CREATE POLICY "Allow all on queue" ON kara_queue FOR ALL USING (true);
CREATE POLICY "Allow all on history" ON kara_song_history FOR ALL USING (true);
CREATE POLICY "Allow all on participants" ON kara_room_participants FOR ALL USING (true);

