-- PostgreSQL function to reorder user's own queue items
-- Phase III: Smart Features
-- Date: 2026-01-13

CREATE OR REPLACE FUNCTION user_reorder_queue(
    p_queue_item_id UUID,
    p_user_id UUID,
    p_direction VARCHAR(4) -- 'up' or 'down'
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
    -- Get queue item first to get room_id for the lock
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
    
    -- Get room's queue_mode to determine if we need to handle round_number
    SELECT queue_mode INTO v_queue_mode
    FROM kara_rooms
    WHERE id = v_room_id;
    
    -- Acquire advisory lock to prevent advance_playback from running during swap
    -- This prevents race conditions where advance_playback sees inconsistent position state
    v_lock_key := ('x' || substr(md5(v_room_id::text), 1, 16))::bit(64)::bigint;
    PERFORM pg_advisory_xact_lock(v_lock_key);
    
    -- Get all user's pending songs, ordered by position
    SELECT ARRAY_AGG(id ORDER BY position) INTO v_user_song_ids
    FROM kara_queue
    WHERE room_id = v_room_id
    AND user_id = p_user_id
    AND status = 'pending';
    
    -- Check if array is null or empty
    IF v_user_song_ids IS NULL OR array_length(v_user_song_ids, 1) IS NULL THEN
        RETURN FALSE;
    END IF;
    
    v_total_count := array_length(v_user_song_ids, 1);
    
    -- Find current index
    v_current_index := array_position(v_user_song_ids, p_queue_item_id);
    
    IF v_current_index IS NULL THEN
        RETURN FALSE;
    END IF;
    
    -- Calculate target index
    IF p_direction = 'up' THEN
        v_target_index := v_current_index - 1;
        IF v_target_index < 1 THEN
            RETURN FALSE; -- Already at top
        END IF;
    ELSIF p_direction = 'down' THEN
        v_target_index := v_current_index + 1;
        IF v_target_index > v_total_count THEN
            RETURN FALSE; -- Already at bottom
        END IF;
    ELSE
        RETURN FALSE; -- Invalid direction
    END IF;
    
    -- Get target song
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
    
    -- Swap positions of two adjacent songs in user's list
    -- In round-robin mode: also swap round_number to maintain correct round ordering
    -- In FIFO mode: only swap positions (round_number stays 1)
    v_temp_position := v_queue_item.position;
    v_temp_round_number := v_queue_item.round_number;
    
    -- Atomic swap using very high temporary position to avoid conflicts
    -- Advisory lock ensures advance_playback cannot run during this swap
    -- All updates happen in the same transaction (atomic)
    -- Using 2147483647 (max INTEGER) ensures it's always last in ORDER BY position ASC
    IF v_queue_mode = 'round_robin' THEN
        -- Round-robin: swap both position AND round_number
        -- This ensures that when positions change, round ordering is preserved correctly
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
        -- FIFO: only swap positions (round_number is always 1, no need to swap)
        UPDATE kara_queue SET position = 2147483647 WHERE id = p_queue_item_id;
        UPDATE kara_queue SET position = v_temp_position WHERE id = v_target_song.id;
        UPDATE kara_queue SET position = v_target_song.position WHERE id = p_queue_item_id;
    END IF;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Add comment
COMMENT ON FUNCTION user_reorder_queue IS 
  'Allows users to reorder their own pending queue items. Swaps positions atomically.';
