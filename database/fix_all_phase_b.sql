-- Fix: Apply all Phase B database changes
-- Run this in Supabase SQL Editor to ensure all Phase B features are enabled

-- ============================================
-- 1. Add missing columns to kara_rooms
-- ============================================

-- Add current_entry_id column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'kara_rooms' 
        AND column_name = 'current_entry_id'
    ) THEN
        ALTER TABLE kara_rooms 
        ADD COLUMN current_entry_id UUID;
        
        COMMENT ON COLUMN kara_rooms.current_entry_id IS 'Backend-controlled playback: current playing queue entry';
    END IF;
END $$;

-- Add last_singer_id column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'kara_rooms' 
        AND column_name = 'last_singer_id'
    ) THEN
        ALTER TABLE kara_rooms 
        ADD COLUMN last_singer_id UUID REFERENCES kara_users(id) ON DELETE SET NULL;
        
        COMMENT ON COLUMN kara_rooms.last_singer_id IS 'Round-robin cursor: last singer who had a turn';
    END IF;
END $$;

-- ============================================
-- 2. Add FK constraint for current_entry_id
-- ============================================

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

-- ============================================
-- 3. Clean up duplicate "playing" entries before creating index
-- ============================================

-- First, fix any rooms with multiple "playing" entries
-- Keep only the most recent one (highest started_at or id)
DO $$
DECLARE
    room_record RECORD;
    keep_entry_id UUID;
BEGIN
    -- Find rooms with multiple playing entries
    FOR room_record IN
        SELECT room_id, COUNT(*) as playing_count
        FROM kara_queue
        WHERE status = 'playing'
        GROUP BY room_id
        HAVING COUNT(*) > 1
    LOOP
        -- Find the entry to keep (most recent started_at, or highest id if started_at is null)
        SELECT id INTO keep_entry_id
        FROM kara_queue
        WHERE room_id = room_record.room_id
        AND status = 'playing'
        ORDER BY 
            COALESCE(started_at, '1970-01-01'::timestamptz) DESC,
            id DESC
        LIMIT 1;
        
        -- Mark all other playing entries as completed (or skipped if you prefer)
        UPDATE kara_queue
        SET 
            status = 'completed',
            completed_at = NOW()
        WHERE room_id = room_record.room_id
        AND status = 'playing'
        AND id != keep_entry_id;
        
        RAISE NOTICE 'Fixed room %: kept entry %, marked others as completed', room_record.room_id, keep_entry_id;
    END LOOP;
END $$;

-- Also ensure kara_rooms.current_entry_id points to a valid playing entry
-- If current_entry_id exists but entry is not playing, clear it
UPDATE kara_rooms
SET current_entry_id = NULL
WHERE current_entry_id IS NOT NULL
AND NOT EXISTS (
    SELECT 1 FROM kara_queue
    WHERE kara_queue.id = kara_rooms.current_entry_id
    AND kara_queue.status = 'playing'
);

-- ============================================
-- 4. Add partial unique index (one playing per room)
-- ============================================

-- Drop index if it exists (in case of previous failed attempt)
DROP INDEX IF EXISTS idx_queue_one_playing_per_room;

CREATE UNIQUE INDEX idx_queue_one_playing_per_room 
ON kara_queue(room_id) 
WHERE status = 'playing';

-- ============================================
-- 4. Create/Fix transition_playback function
-- ============================================

-- Drop all possible variations
DROP FUNCTION IF EXISTS transition_playback(UUID, UUID, VARCHAR, UUID);
DROP FUNCTION IF EXISTS transition_playback(p_room_id UUID, p_current_entry_id UUID, p_new_status VARCHAR, p_next_entry_id UUID);
DROP FUNCTION IF EXISTS transition_playback(p_current_entry_id UUID, p_new_status VARCHAR, p_next_entry_id UUID, p_room_id UUID);

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

-- ============================================
-- 5. Create/Fix start_playback function
-- ============================================

DROP FUNCTION IF EXISTS start_playback(UUID, UUID);
DROP FUNCTION IF EXISTS start_playback(p_room_id UUID, p_entry_id UUID);
DROP FUNCTION IF EXISTS start_playback(p_entry_id UUID, p_room_id UUID);

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

-- ============================================
-- 7. Verify everything exists
-- ============================================

-- Verify columns
SELECT 
    'Columns' as check_type,
    column_name, 
    data_type, 
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'kara_rooms' 
AND column_name IN ('current_entry_id', 'last_singer_id')
ORDER BY column_name;

-- Verify index
SELECT 
    'Index' as check_type,
    indexname,
    indexdef
FROM pg_indexes 
WHERE indexname = 'idx_queue_one_playing_per_room';

-- Verify functions
SELECT 
    'Function' as check_type,
    proname as function_name,
    pg_get_function_arguments(oid) as arguments
FROM pg_proc 
WHERE proname IN ('start_playback', 'transition_playback')
ORDER BY proname;

