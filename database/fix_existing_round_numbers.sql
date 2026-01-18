-- Migration: Fix existing round_numbers in kara_queue for round-robin mode
-- This recalculates round_number for all pending songs based on user order
-- Run this AFTER running fix_round_robin_logic.sql

-- Step 1: Create a temporary function to recalculate round_number for existing songs
CREATE OR REPLACE FUNCTION recalculate_round_numbers(p_room_id UUID)
RETURNS VOID AS $$
DECLARE
    v_queue_mode VARCHAR(20);
    v_song RECORD;
    v_user_round INTEGER;
    v_current_round INTEGER;
    v_user_song_count INTEGER;
    v_max_round INTEGER;
BEGIN
    -- Get room's queue mode
    SELECT queue_mode INTO v_queue_mode
    FROM kara_rooms
    WHERE id = p_room_id;
    
    -- Only process if round-robin mode
    IF v_queue_mode != 'round_robin' THEN
        RETURN;
    END IF;
    
    -- Get max round to know how many rounds to check
    SELECT COALESCE(MAX(round_number), 0) INTO v_max_round
    FROM kara_queue
    WHERE room_id = p_room_id
    AND status = 'pending';
    
    -- Process each pending song
    FOR v_song IN 
        SELECT id, user_id, position
        FROM kara_queue
        WHERE room_id = p_room_id
        AND status = 'pending'
        ORDER BY position ASC
    LOOP
        -- Find the first round where this user doesn't have a song yet
        v_user_round := NULL;
        
        -- Loop through rounds to find where this user should be
        FOR v_current_round IN 1..(v_max_round + 1) LOOP
            -- Count how many songs this user has in this round (excluding current song)
            SELECT COUNT(*) INTO v_user_song_count
            FROM kara_queue
            WHERE room_id = p_room_id
            AND user_id = v_song.user_id
            AND status = 'pending'
            AND round_number = v_current_round
            AND id != v_song.id; -- Exclude current song
            
            -- If user has 0 songs in this round, this is their round
            IF v_user_song_count = 0 THEN
                v_user_round := v_current_round;
                EXIT;
            END IF;
        END LOOP;
        
        -- Update the song's round_number
        IF v_user_round IS NOT NULL THEN
            UPDATE kara_queue
            SET round_number = v_user_round
            WHERE id = v_song.id;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Step 2: Run the recalculation for the specific room
-- Replace 'a4b788e3-08b8-43ab-93df-9799c78ca886' with your room_id
SELECT recalculate_round_numbers('a4b788e3-08b8-43ab-93df-9799c78ca886');

-- Step 3: Clean up the temporary function (optional)
-- DROP FUNCTION recalculate_round_numbers(UUID);

-- Verification query:
-- SELECT 
--   id,
--   user_id,
--   position,
--   round_number,
--   status
-- FROM kara_queue
-- WHERE room_id = 'a4b788e3-08b8-43ab-93df-9799c78ca886'
-- AND status = 'pending'
-- ORDER BY round_number ASC, position ASC;
