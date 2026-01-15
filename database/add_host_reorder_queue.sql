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
    v_queue_mode VARCHAR(20);
    v_current_position INTEGER;
    v_current_round_number INTEGER;
    v_min_position INTEGER;
    v_max_position INTEGER;
    v_new_round_number INTEGER;
    v_rows_updated INTEGER;
BEGIN
    -- Use room_id as advisory lock key
    v_lock_key := ('x' || substr(md5(p_room_id::text), 1, 16))::bit(64)::bigint;
    
    -- Acquire advisory lock
    PERFORM pg_advisory_xact_lock(v_lock_key);
    
    -- Get room's queue_mode
    SELECT queue_mode INTO v_queue_mode
    FROM kara_rooms
    WHERE id = p_room_id;
    
    -- Get current position and round_number of the item to reorder
    SELECT position, round_number INTO v_current_position, v_current_round_number
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
    
    -- In round-robin mode, get the round_number at the new position
    IF v_queue_mode = 'round_robin' THEN
        SELECT round_number INTO v_new_round_number
        FROM kara_queue
        WHERE room_id = p_room_id
        AND status = 'pending'
        AND position = p_new_position
        LIMIT 1;
        
        -- If no item at new position (edge case), use current round_number
        IF v_new_round_number IS NULL THEN
            v_new_round_number := v_current_round_number;
        END IF;
    ELSE
        v_new_round_number := 1; -- FIFO mode doesn't use round_number
    END IF;
    
    -- Reorder: shift positions (and round_number in round-robin mode)
    IF v_current_position < p_new_position THEN
        -- Moving down: shift items between current and new position up by 1
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
        -- Moving up: shift items between new and current position down by 1
        UPDATE kara_queue
        SET position = position + 1
        WHERE room_id = p_room_id
        AND status = 'pending'
        AND position >= p_new_position
        AND position < v_current_position;
    END IF;
    
    -- Update the target item to new position (and round_number in round-robin mode)
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
    
    -- Verify update succeeded
    IF v_rows_updated = 1 THEN
        RETURN TRUE;
    ELSE
        RETURN FALSE;
    END IF;
END;
$$ LANGUAGE plpgsql;

