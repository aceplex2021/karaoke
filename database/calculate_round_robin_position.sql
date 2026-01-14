-- PostgreSQL function to calculate round-robin queue position
-- Phase III: Smart Features
-- Date: 2026-01-13

CREATE OR REPLACE FUNCTION calculate_round_robin_position(
    p_room_id UUID,
    p_user_id UUID
)
RETURNS INTEGER AS $$
DECLARE
    v_queue_mode VARCHAR(20);
    v_current_round INTEGER;
    v_user_in_round BOOLEAN;
    v_max_position INTEGER;
    v_new_position INTEGER;
    v_max_pos_in_round INTEGER;
BEGIN
    -- Get room's queue mode
    SELECT queue_mode INTO v_queue_mode
    FROM kara_rooms
    WHERE id = p_room_id;
    
    -- If FIFO or mode not set, use simple max + 1
    IF v_queue_mode IS NULL OR v_queue_mode = 'fifo' THEN
        SELECT COALESCE(MAX(position), 0) + 1 INTO v_new_position
        FROM kara_queue
        WHERE room_id = p_room_id
        AND status IN ('pending', 'playing');
        
        RETURN v_new_position;
    END IF;
    
    -- Round Robin logic
    -- Get current round (max round_number of pending songs)
    SELECT COALESCE(MAX(round_number), 1) INTO v_current_round
    FROM kara_queue
    WHERE room_id = p_room_id
    AND status = 'pending';
    
    -- Check if user has song in current round
    SELECT EXISTS(
        SELECT 1
        FROM kara_queue
        WHERE room_id = p_room_id
        AND user_id = p_user_id
        AND status = 'pending'
        AND round_number = v_current_round
    ) INTO v_user_in_round;
    
    IF NOT v_user_in_round THEN
        -- User hasn't sung in current round - add at end of current round
        SELECT COALESCE(MAX(position), 0) INTO v_max_pos_in_round
        FROM kara_queue
        WHERE room_id = p_room_id
        AND status = 'pending'
        AND round_number = v_current_round;
        
        -- If no songs in current round, start at position 1
        IF v_max_pos_in_round IS NULL OR v_max_pos_in_round = 0 THEN
            v_new_position := 1;
        ELSE
            v_new_position := v_max_pos_in_round + 1;
        END IF;
    ELSE
        -- User already sang in current round - add at end of queue (next round)
        SELECT COALESCE(MAX(position), 0) + 1 INTO v_new_position
        FROM kara_queue
        WHERE room_id = p_room_id
        AND status IN ('pending', 'playing');
    END IF;
    
    RETURN v_new_position;
END;
$$ LANGUAGE plpgsql;

-- Add comment
COMMENT ON FUNCTION calculate_round_robin_position IS 
  'Calculates queue position based on room queue_mode. Returns position for FIFO or round-robin mode.';
