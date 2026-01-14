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
    v_queue_item RECORD;
    v_room_id UUID;
    v_current_index INTEGER;
    v_target_index INTEGER;
    v_target_song RECORD;
    v_temp_position INTEGER;
    v_user_song_ids UUID[];
    v_total_count INTEGER;
BEGIN
    -- Get queue item and verify ownership
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
    
    -- Swap positions atomically
    v_temp_position := v_queue_item.position;
    
    UPDATE kara_queue
    SET position = v_target_song.position
    WHERE id = p_queue_item_id;
    
    UPDATE kara_queue
    SET position = v_temp_position
    WHERE id = v_target_song.id;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Add comment
COMMENT ON FUNCTION user_reorder_queue IS 
  'Allows users to reorder their own pending queue items. Swaps positions atomically.';
