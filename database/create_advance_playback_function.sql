-- Function: advance_playback
-- Date: 2026-01-13
-- Purpose: Atomic state transition for TV playback (pending → playing → completed)
-- Called by: /api/rooms/[roomId]/advance

CREATE OR REPLACE FUNCTION advance_playback(p_room_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_current_id UUID;
  v_current_user_id UUID;
  v_current_version_id UUID;
  v_current_song_id_from_queue UUID;
  v_current_song_id UUID;
  v_next_id UUID;
  v_queue_mode VARCHAR(20);
  v_existing_history_id UUID;
BEGIN
  -- 1. Get current playing entry with user_id, version_id, and song_id (for backward compatibility)
  SELECT id, user_id, version_id, song_id INTO v_current_id, v_current_user_id, v_current_version_id, v_current_song_id_from_queue
  FROM kara_queue
  WHERE room_id = p_room_id AND status = 'playing'
  LIMIT 1;
  
  -- 2. Mark current as completed and write to history (if exists)
  IF v_current_id IS NOT NULL THEN
    -- Get song_id: prefer from queue (backward compatibility), otherwise from version
    IF v_current_song_id_from_queue IS NOT NULL THEN
      v_current_song_id := v_current_song_id_from_queue;
    ELSIF v_current_version_id IS NOT NULL THEN
      SELECT song_id INTO v_current_song_id
      FROM kara_versions
      WHERE id = v_current_version_id;
    END IF;
    
    -- Mark as completed
    UPDATE kara_queue
    SET 
      status = 'completed', 
      completed_at = NOW()
    WHERE id = v_current_id;
    
    -- Write to history if we have song_id
    IF v_current_song_id IS NOT NULL AND v_current_user_id IS NOT NULL THEN
      -- Check if history entry already exists for this user/song/room
      SELECT id INTO v_existing_history_id
      FROM kara_song_history
      WHERE room_id = p_room_id
        AND user_id = v_current_user_id
        AND song_id = v_current_song_id
      LIMIT 1;
      
      IF v_existing_history_id IS NOT NULL THEN
        -- Update existing entry: increment times_sung and update sung_at
        UPDATE kara_song_history
        SET 
          times_sung = times_sung + 1,
          sung_at = NOW()
        WHERE id = v_existing_history_id;
      ELSE
        -- Insert new history entry
        INSERT INTO kara_song_history (room_id, user_id, song_id, sung_at, times_sung)
        VALUES (p_room_id, v_current_user_id, v_current_song_id, NOW(), 1);
      END IF;
    END IF;
  END IF;
  
  -- 3. Get room's queue_mode
  SELECT queue_mode INTO v_queue_mode
  FROM kara_rooms
  WHERE id = p_room_id;
  
  -- 4. Get next pending song (ordered by queue_mode)
  IF v_queue_mode = 'round_robin' THEN
    -- Round-robin: order by round_number first, then position within round
    SELECT id INTO v_next_id
    FROM kara_queue
    WHERE room_id = p_room_id AND status = 'pending'
    ORDER BY round_number ASC, position ASC
    LIMIT 1;
  ELSE
    -- FIFO: order by position only (default behavior)
    SELECT id INTO v_next_id
    FROM kara_queue
    WHERE room_id = p_room_id AND status = 'pending'
    ORDER BY position ASC
    LIMIT 1;
  END IF;
  
  -- 5. Start next song (if exists)
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
