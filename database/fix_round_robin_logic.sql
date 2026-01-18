-- Fix round-robin logic to be strictly based on user order
-- Round-robin should be: A1, B1, A2, B2, A3, A4 (if A has 4, B has 2)
-- NOT based on timestamp or max round_number

CREATE OR REPLACE FUNCTION calculate_round_robin_position(
    p_room_id UUID,
    p_user_id UUID
)
RETURNS INTEGER AS $$
DECLARE
    v_queue_mode VARCHAR(20);
    v_current_round INTEGER;
    v_user_song_count INTEGER;
    v_all_users_rounds RECORD;
    v_min_round INTEGER;
    v_max_round INTEGER;
    v_user_round INTEGER;
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
    
    -- Round Robin logic: Strictly based on user order
    -- Each user gets ONE song per round maximum
    -- Round 1: First song from each user (A1, B1, C1...)
    -- Round 2: Second song from each user (A2, B2, C2...)
    -- Round 3: Third song from each user (A3, B3, C3...)
    -- If a user doesn't have a song for a round, they skip that round
    
    -- Find the first round where this user doesn't have a song yet
    -- Start from round 1 and check each round
    v_user_round := 1;
    v_max_round := COALESCE((SELECT MAX(round_number) FROM kara_queue WHERE room_id = p_room_id AND status = 'pending'), 0);
    
    -- Loop through rounds to find the first round where this user doesn't have a song
    FOR v_current_round IN 1..(v_max_round + 1) LOOP
        -- Check if this user has a song in this round
        SELECT COUNT(*) INTO v_user_song_count
        FROM kara_queue
        WHERE room_id = p_room_id
        AND user_id = p_user_id
        AND status = 'pending'
        AND round_number = v_current_round;
        
        -- If user has 0 songs in this round, this is their round
        IF v_user_song_count = 0 THEN
            v_user_round := v_current_round;
            EXIT;
        END IF;
    END LOOP;
    
    -- Calculate position: find max position in this round, add 1
    SELECT COALESCE(MAX(position), 0) INTO v_max_pos_in_round
    FROM kara_queue
    WHERE room_id = p_room_id
    AND status = 'pending'
    AND round_number = v_user_round;
    
    -- If no songs in this round yet, find the position after the last song of previous rounds
    IF v_max_pos_in_round IS NULL OR v_max_pos_in_round = 0 THEN
        -- Find max position across all rounds up to this round
        SELECT COALESCE(MAX(position), 0) INTO v_max_pos_in_round
        FROM kara_queue
        WHERE room_id = p_room_id
        AND status = 'pending'
        AND round_number < v_user_round;
        
        v_new_position := v_max_pos_in_round + 1;
    ELSE
        v_new_position := v_max_pos_in_round + 1;
    END IF;
    
    RETURN v_new_position;
END;
$$ LANGUAGE plpgsql;

-- Update the comment
COMMENT ON FUNCTION calculate_round_robin_position IS 
  'Calculates queue position based on room queue_mode. Round-robin: each user gets one turn per round, strictly by user order (A1, B1, A2, B2, etc.)';
