-- Function: advance_playback
-- Date: 2026-01-13
-- Purpose: Atomic state transition for TV playback (pending → playing → completed)
-- Called by: /api/rooms/[roomId]/advance

CREATE OR REPLACE FUNCTION advance_playback(p_room_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_current_id UUID;
  v_next_id UUID;
BEGIN
  -- 1. Get current playing entry
  SELECT id INTO v_current_id
  FROM kara_queue
  WHERE room_id = p_room_id AND status = 'playing'
  LIMIT 1;
  
  -- 2. Mark current as completed (if exists)
  IF v_current_id IS NOT NULL THEN
    UPDATE kara_queue
    SET 
      status = 'completed', 
      completed_at = NOW()
    WHERE id = v_current_id;
  END IF;
  
  -- 3. Get next pending song (ordered by position)
  SELECT id INTO v_next_id
  FROM kara_queue
  WHERE room_id = p_room_id AND status = 'pending'
  ORDER BY position ASC
  LIMIT 1;
  
  -- 4. Start next song (if exists)
  IF v_next_id IS NOT NULL THEN
    UPDATE kara_queue
    SET 
      status = 'playing', 
      started_at = NOW()
    WHERE id = v_next_id;
    
    -- Update room pointer to new playing song
    UPDATE kara_rooms
    SET 
      current_entry_id = v_next_id,
      updated_at = NOW()
    WHERE id = p_room_id;
    
    RETURN TRUE; -- Successfully advanced to next song
  ELSE
    -- No more songs in queue, clear room pointer
    UPDATE kara_rooms
    SET 
      current_entry_id = NULL,
      updated_at = NOW()
    WHERE id = p_room_id;
    
    RETURN FALSE; -- No more songs (queue empty)
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION advance_playback(UUID) TO authenticated, anon, service_role;

-- Test the function:
-- SELECT advance_playback('your-room-id-here');
