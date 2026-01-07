-- Add host_reorder_queue PostgreSQL function
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

