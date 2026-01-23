-- ============================================
-- v4.5.2: Make History User-Global (Not Room-Specific)
-- ============================================
-- Purpose: Allow users to maintain song history across all rooms
-- Changes: 
--   1. Remove room_id from unique constraint (keep column for reference)
--   2. Merge duplicate entries (same user + song across multiple rooms)
--   3. Update advance_playback to not filter by room_id
-- ============================================

BEGIN;

-- ============================================
-- STEP 1: Merge Duplicate History Entries
-- ============================================
-- If user sang same song in multiple rooms, consolidate into one entry
-- Keep the entry with highest times_sung + most recent sung_at

-- Create temporary table to track which entries to keep
CREATE TEMP TABLE history_to_keep AS
SELECT DISTINCT ON (user_id, version_id)
  id,
  user_id,
  version_id,
  SUM(times_sung) OVER (PARTITION BY user_id, version_id) as total_times_sung,
  MAX(sung_at) OVER (PARTITION BY user_id, version_id) as latest_sung_at
FROM kara_song_history
ORDER BY user_id, version_id, sung_at DESC;

-- Update the entries we're keeping with consolidated data
UPDATE kara_song_history h
SET 
  times_sung = k.total_times_sung,
  sung_at = k.latest_sung_at,
  updated_at = NOW()
FROM history_to_keep k
WHERE h.id = k.id;

-- Delete duplicate entries (keep only the ones in history_to_keep)
DELETE FROM kara_song_history
WHERE id NOT IN (SELECT id FROM history_to_keep);

-- ============================================
-- STEP 2: Update Unique Constraint
-- ============================================
-- Drop old constraint (room_id, user_id, version_id)
DROP INDEX IF EXISTS idx_history_room_user_version;

-- Create new constraint (user_id, version_id only)
CREATE UNIQUE INDEX idx_history_user_version 
  ON kara_song_history(user_id, version_id);

-- Note: Keep room_id column for reference (shows where song was last sung)

-- ============================================
-- STEP 3: Update advance_playback Function
-- ============================================
-- Modify to lookup history by user_id + version_id only (not room_id)

CREATE OR REPLACE FUNCTION advance_playback(p_room_id UUID)
RETURNS TABLE(
  next_song_id UUID,
  next_song_position INTEGER,
  next_song_user_id UUID
) LANGUAGE plpgsql AS $$
DECLARE
  v_current_entry_id UUID;
  v_current_version_id UUID;
  v_current_user_id UUID;
  v_queue_mode TEXT;
  v_next_entry kara_queue%ROWTYPE;
  v_existing_history_id UUID;
BEGIN
  -- 1. Get current song
  SELECT current_entry_id INTO v_current_entry_id
  FROM kara_rooms
  WHERE id = p_room_id;
  
  -- 2. Write history for current song (if exists)
  IF v_current_entry_id IS NOT NULL THEN
    SELECT version_id, user_id INTO v_current_version_id, v_current_user_id
    FROM kara_queue
    WHERE id = v_current_entry_id;
    
    -- Write to history if we have version_id and user_id
    IF v_current_version_id IS NOT NULL AND v_current_user_id IS NOT NULL THEN
      -- v4.5.2: Check if history entry exists for this user + version (NO room_id filter)
      SELECT id INTO v_existing_history_id
      FROM kara_song_history
      WHERE user_id = v_current_user_id
        AND version_id = v_current_version_id
      LIMIT 1;
      
      IF v_existing_history_id IS NOT NULL THEN
        -- Update existing entry: increment times_sung and update sung_at
        UPDATE kara_song_history
        SET 
          times_sung = times_sung + 1,
          sung_at = NOW(),
          room_id = p_room_id, -- Update to most recent room (for reference)
          updated_at = NOW()
        WHERE id = v_existing_history_id;
      ELSE
        -- Insert new history entry
        INSERT INTO kara_song_history (room_id, user_id, version_id, sung_at, times_sung)
        VALUES (p_room_id, v_current_user_id, v_current_version_id, NOW(), 1);
      END IF;
    END IF;

    -- Mark current song as completed
    UPDATE kara_queue
    SET 
      status = 'completed',
      completed_at = NOW()
    WHERE id = v_current_entry_id;
  END IF;
  
  -- 3. Get room's queue_mode
  SELECT queue_mode INTO v_queue_mode
  FROM kara_rooms
  WHERE id = p_room_id;
  
  -- 4. Get next song based on queue mode
  IF v_queue_mode = 'round_robin' THEN
    -- Round-robin: Get next by position and turn rotation
    SELECT * INTO v_next_entry
    FROM kara_queue
    WHERE room_id = p_room_id
      AND status = 'pending'
    ORDER BY position ASC
    LIMIT 1;
  ELSE
    -- FIFO: Get next by position only
    SELECT * INTO v_next_entry
    FROM kara_queue
    WHERE room_id = p_room_id
      AND status = 'pending'
    ORDER BY position ASC
    LIMIT 1;
  END IF;
  
  -- 5. Update room with next song (or NULL if queue empty)
  UPDATE kara_rooms
  SET 
    current_entry_id = v_next_entry.id,
    updated_at = NOW()
  WHERE id = p_room_id;
  
  -- 6. If next song exists, mark it as playing
  IF v_next_entry.id IS NOT NULL THEN
    UPDATE kara_queue
    SET 
      status = 'playing',
      played_at = NOW()
    WHERE id = v_next_entry.id;
  END IF;
  
  -- 7. Return next song info
  RETURN QUERY
  SELECT 
    v_next_entry.id,
    v_next_entry.position,
    v_next_entry.user_id;
END;
$$;

COMMIT;

-- ============================================
-- VERIFICATION QUERIES (Run these to check)
-- ============================================
-- Check for any remaining duplicates (should be 0)
-- SELECT user_id, version_id, COUNT(*) as count
-- FROM kara_song_history
-- GROUP BY user_id, version_id
-- HAVING COUNT(*) > 1;

-- Check history entries
-- SELECT 
--   u.display_name,
--   v.title_display,
--   h.times_sung,
--   h.sung_at,
--   h.room_id as last_room
-- FROM kara_song_history h
-- JOIN kara_users u ON h.user_id = u.id
-- JOIN kara_versions v ON h.version_id = v.id
-- ORDER BY h.sung_at DESC
-- LIMIT 20;
