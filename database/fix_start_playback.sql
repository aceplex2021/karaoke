-- Fix: Ensure start_playback function exists with correct signature
-- Run this in Supabase SQL Editor if you get "Could not find the function" errors

-- Drop and recreate to ensure correct signature
DROP FUNCTION IF EXISTS start_playback(UUID, UUID);
DROP FUNCTION IF EXISTS start_playback(p_room_id UUID, p_entry_id UUID);
DROP FUNCTION IF EXISTS start_playback(p_entry_id UUID, p_room_id UUID);

-- Create function with correct signature: p_room_id first, then p_entry_id
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

-- Verify function exists
SELECT 
    proname as function_name,
    pg_get_function_arguments(oid) as arguments
FROM pg_proc 
WHERE proname = 'start_playback';

