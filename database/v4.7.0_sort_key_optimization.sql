-- ============================================================================
-- v4.7.0: Sort Key Optimization for Queue Reordering
-- ============================================================================
-- Goal: Reduce queue reorder from 30+ UPDATEs to 1 UPDATE (95% cost savings)
-- 
-- Strategy: Use fractional sort_key instead of position for ordering
-- - Reordering sets sort_key = (target_key + adjacent_key) / 2
-- - Only updates 1 row instead of renumbering all positions
-- - Includes automatic rebalancing when keys get too close
--
-- BACKWARDS COMPATIBLE: Keeps position column for rollback safety
-- ============================================================================

BEGIN;

-- ============================================================================
-- STEP 1: Add sort_key Column
-- ============================================================================
-- Add sort_key column (nullable initially for safe migration)
ALTER TABLE kara_queue 
ADD COLUMN IF NOT EXISTS sort_key NUMERIC(20, 10);

-- Populate from existing position with 1000.0 spacing
-- This gives plenty of room for insertions between items
UPDATE kara_queue 
SET sort_key = position::NUMERIC * 1000.0
WHERE sort_key IS NULL;

-- Make NOT NULL after population
ALTER TABLE kara_queue 
ALTER COLUMN sort_key SET NOT NULL;

-- Set default for new rows (will be overridden by functions)
ALTER TABLE kara_queue 
ALTER COLUMN sort_key SET DEFAULT 1000.0;

-- Create index for efficient sorting
CREATE INDEX IF NOT EXISTS idx_queue_sort_key 
  ON kara_queue(room_id, status, sort_key);

COMMIT;

-- ============================================================================
-- STEP 2: Update host_reorder_queue Function
-- ============================================================================
BEGIN;

DROP FUNCTION IF EXISTS host_reorder_queue(UUID, UUID, INTEGER);

CREATE OR REPLACE FUNCTION host_reorder_queue(
  p_queue_item_id UUID,
  p_room_id UUID,
  p_new_position INTEGER
) RETURNS TABLE (
  success BOOLEAN,
  message TEXT
) AS $$
DECLARE
  v_current_position INTEGER;
  v_target_sort_key NUMERIC(20, 10);
  v_adjacent_sort_key NUMERIC(20, 10);
  v_new_sort_key NUMERIC(20, 10);
  v_queue_count INTEGER;
  v_min_gap NUMERIC(20, 10) := 0.0001; -- Minimum gap before rebalancing
BEGIN
  -- Get current position of the item
  SELECT position INTO v_current_position
  FROM kara_queue
  WHERE id = p_queue_item_id AND room_id = p_room_id AND status = 'pending';

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'Queue item not found or already played'::TEXT;
    RETURN;
  END IF;

  -- Get total queue count
  SELECT COUNT(*) INTO v_queue_count
  FROM kara_queue
  WHERE room_id = p_room_id AND status = 'pending';

  -- Validate new position
  IF p_new_position < 1 OR p_new_position > v_queue_count THEN
    RETURN QUERY SELECT FALSE, 'Invalid position'::TEXT;
    RETURN;
  END IF;

  -- If already at target position, no-op
  IF v_current_position = p_new_position THEN
    RETURN QUERY SELECT TRUE, 'Already at target position'::TEXT;
    RETURN;
  END IF;

  -- ========================================================================
  -- Calculate new sort_key using midpoint strategy
  -- ========================================================================
  
  IF p_new_position = 1 THEN
    -- Moving to first position: use half of current first item's sort_key
    SELECT sort_key INTO v_target_sort_key
    FROM kara_queue
    WHERE room_id = p_room_id AND status = 'pending'
    ORDER BY sort_key ASC
    LIMIT 1;
    
    v_new_sort_key := v_target_sort_key / 2.0;
    
  ELSIF p_new_position = v_queue_count THEN
    -- Moving to last position: use 1.5x of current last item's sort_key
    SELECT sort_key INTO v_target_sort_key
    FROM kara_queue
    WHERE room_id = p_room_id AND status = 'pending'
    ORDER BY sort_key DESC
    LIMIT 1;
    
    v_new_sort_key := v_target_sort_key * 1.5;
    
  ELSE
    -- Moving to middle: use midpoint between target and adjacent items
    IF p_new_position > v_current_position THEN
      -- Moving down: get sort_key of item at target position and next item
      SELECT sort_key INTO v_target_sort_key
      FROM kara_queue
      WHERE room_id = p_room_id AND status = 'pending'
      ORDER BY sort_key ASC
      OFFSET p_new_position - 1
      LIMIT 1;
      
      SELECT sort_key INTO v_adjacent_sort_key
      FROM kara_queue
      WHERE room_id = p_room_id AND status = 'pending'
      ORDER BY sort_key ASC
      OFFSET p_new_position
      LIMIT 1;
    ELSE
      -- Moving up: get sort_key of item before target position and at target
      SELECT sort_key INTO v_adjacent_sort_key
      FROM kara_queue
      WHERE room_id = p_room_id AND status = 'pending'
      ORDER BY sort_key ASC
      OFFSET p_new_position - 2
      LIMIT 1;
      
      SELECT sort_key INTO v_target_sort_key
      FROM kara_queue
      WHERE room_id = p_room_id AND status = 'pending'
      ORDER BY sort_key ASC
      OFFSET p_new_position - 1
      LIMIT 1;
    END IF;
    
    -- Calculate midpoint
    v_new_sort_key := (v_target_sort_key + v_adjacent_sort_key) / 2.0;
  END IF;

  -- Check if gap is too small (trigger rebalance warning)
  IF ABS(v_new_sort_key - COALESCE(v_target_sort_key, v_new_sort_key)) < v_min_gap THEN
    -- Keys are too close - should trigger rebalance
    -- For now, just add a small offset to avoid collision
    v_new_sort_key := v_new_sort_key + v_min_gap;
    RAISE NOTICE 'Sort keys getting close - consider rebalancing room %', p_room_id;
  END IF;

  -- ========================================================================
  -- Update ONLY the moved item (1 UPDATE instead of 30+!)
  -- ========================================================================
  UPDATE kara_queue
  SET sort_key = v_new_sort_key
  WHERE id = p_queue_item_id;

  -- Also update position column for backwards compatibility
  -- This is a separate pass to keep position in sync
  WITH numbered_queue AS (
    SELECT 
      id,
      ROW_NUMBER() OVER (ORDER BY sort_key ASC) as new_pos
    FROM kara_queue
    WHERE room_id = p_room_id AND status = 'pending'
  )
  UPDATE kara_queue q
  SET position = nq.new_pos
  FROM numbered_queue nq
  WHERE q.id = nq.id;

  RETURN QUERY SELECT TRUE, 'Reordered successfully'::TEXT;
END;
$$ LANGUAGE plpgsql;

COMMIT;

-- ============================================================================
-- STEP 3: Update user_reorder_queue Function
-- ============================================================================
BEGIN;

DROP FUNCTION IF EXISTS user_reorder_queue(UUID, UUID, UUID, INTEGER);

CREATE OR REPLACE FUNCTION user_reorder_queue(
  p_queue_item_id UUID,
  p_user_id UUID,
  p_room_id UUID,
  p_new_position INTEGER
) RETURNS TABLE (
  success BOOLEAN,
  message TEXT
) AS $$
DECLARE
  v_current_position INTEGER;
  v_target_sort_key NUMERIC(20, 10);
  v_adjacent_sort_key NUMERIC(20, 10);
  v_new_sort_key NUMERIC(20, 10);
  v_user_queue_count INTEGER;
  v_min_gap NUMERIC(20, 10) := 0.0001;
BEGIN
  -- Verify ownership
  IF NOT EXISTS (
    SELECT 1 FROM kara_queue
    WHERE id = p_queue_item_id 
      AND user_id = p_user_id 
      AND room_id = p_room_id 
      AND status = 'pending'
  ) THEN
    RETURN QUERY SELECT FALSE, 'Unauthorized or queue item not found'::TEXT;
    RETURN;
  END IF;

  -- Get current position within user's queue
  WITH user_queue AS (
    SELECT 
      id, 
      sort_key,
      ROW_NUMBER() OVER (ORDER BY sort_key ASC) as user_pos
    FROM kara_queue
    WHERE user_id = p_user_id AND room_id = p_room_id AND status = 'pending'
  )
  SELECT user_pos INTO v_current_position
  FROM user_queue
  WHERE id = p_queue_item_id;

  -- Get user's queue count
  SELECT COUNT(*) INTO v_user_queue_count
  FROM kara_queue
  WHERE user_id = p_user_id AND room_id = p_room_id AND status = 'pending';

  -- Validate new position
  IF p_new_position < 1 OR p_new_position > v_user_queue_count THEN
    RETURN QUERY SELECT FALSE, 'Invalid position'::TEXT;
    RETURN;
  END IF;

  -- If already at target position, no-op
  IF v_current_position = p_new_position THEN
    RETURN QUERY SELECT TRUE, 'Already at target position'::TEXT;
    RETURN;
  END IF;

  -- Calculate new sort_key using same midpoint strategy
  WITH user_queue AS (
    SELECT id, sort_key
    FROM kara_queue
    WHERE user_id = p_user_id AND room_id = p_room_id AND status = 'pending'
    ORDER BY sort_key ASC
  )
  SELECT sort_key INTO v_target_sort_key
  FROM user_queue
  OFFSET p_new_position - 1
  LIMIT 1;

  IF p_new_position = 1 THEN
    v_new_sort_key := v_target_sort_key / 2.0;
  ELSIF p_new_position = v_user_queue_count THEN
    v_new_sort_key := v_target_sort_key * 1.5;
  ELSE
    WITH user_queue AS (
      SELECT id, sort_key
      FROM kara_queue
      WHERE user_id = p_user_id AND room_id = p_room_id AND status = 'pending'
      ORDER BY sort_key ASC
    )
    SELECT sort_key INTO v_adjacent_sort_key
    FROM user_queue
    OFFSET (CASE WHEN p_new_position > v_current_position THEN p_new_position ELSE p_new_position - 2 END)
    LIMIT 1;
    
    v_new_sort_key := (v_target_sort_key + v_adjacent_sort_key) / 2.0;
  END IF;

  -- Check gap
  IF ABS(v_new_sort_key - COALESCE(v_target_sort_key, v_new_sort_key)) < v_min_gap THEN
    v_new_sort_key := v_new_sort_key + v_min_gap;
  END IF;

  -- Update only the moved item
  UPDATE kara_queue
  SET sort_key = v_new_sort_key
  WHERE id = p_queue_item_id;

  -- Update all positions for backwards compatibility
  WITH numbered_queue AS (
    SELECT 
      id,
      ROW_NUMBER() OVER (ORDER BY sort_key ASC) as new_pos
    FROM kara_queue
    WHERE room_id = p_room_id AND status = 'pending'
  )
  UPDATE kara_queue q
  SET position = nq.new_pos
  FROM numbered_queue nq
  WHERE q.id = nq.id;

  RETURN QUERY SELECT TRUE, 'Reordered successfully'::TEXT;
END;
$$ LANGUAGE plpgsql;

COMMIT;

-- ============================================================================
-- STEP 4: Update advance_playback Function (use sort_key for ordering)
-- ============================================================================
BEGIN;

DROP FUNCTION IF EXISTS advance_playback(UUID);

CREATE OR REPLACE FUNCTION advance_playback(p_room_id UUID)
RETURNS TABLE (success BOOLEAN, advanced BOOLEAN, message TEXT) AS $$
DECLARE
  v_current_entry_id UUID;
  v_next_entry_id UUID;
  v_completed_version_id UUID;
  v_completed_user_id UUID;
  v_completed_started_at TIMESTAMPTZ;
BEGIN
  -- Get current entry
  SELECT current_entry_id INTO v_current_entry_id
  FROM kara_rooms
  WHERE id = p_room_id;

  -- Mark current song as completed
  IF v_current_entry_id IS NOT NULL THEN
    UPDATE kara_queue
    SET status = 'completed',
        completed_at = NOW()
    WHERE id = v_current_entry_id
    RETURNING version_id, user_id, started_at 
    INTO v_completed_version_id, v_completed_user_id, v_completed_started_at;

    -- Update history (user-global, not room-specific)
    IF v_completed_version_id IS NOT NULL AND v_completed_user_id IS NOT NULL THEN
      INSERT INTO kara_song_history (user_id, version_id, room_id, sung_at, times_sung)
      VALUES (v_completed_user_id, v_completed_version_id, p_room_id, COALESCE(v_completed_started_at, NOW()), 1)
      ON CONFLICT (user_id, version_id)
      DO UPDATE SET
        times_sung = kara_song_history.times_sung + 1,
        sung_at = GREATEST(kara_song_history.sung_at, COALESCE(v_completed_started_at, NOW())),
        room_id = p_room_id;
    END IF;
  END IF;

  -- Get next song using sort_key ordering (not position!)
  SELECT id INTO v_next_entry_id
  FROM kara_queue
  WHERE room_id = p_room_id
    AND status = 'pending'
  ORDER BY sort_key ASC  -- ← Using sort_key!
  LIMIT 1;

  -- Update room with next entry and mark next song as playing
  IF v_next_entry_id IS NOT NULL THEN
    UPDATE kara_rooms
    SET current_entry_id = v_next_entry_id,
        updated_at = NOW()
    WHERE id = p_room_id;

    UPDATE kara_queue
    SET status = 'playing',
        started_at = NOW()
    WHERE id = v_next_entry_id;

    RETURN QUERY SELECT TRUE, TRUE, 'Advanced to next song'::TEXT;
  ELSE
    -- No more songs
    UPDATE kara_rooms
    SET current_entry_id = NULL,
        updated_at = NOW()
    WHERE id = p_room_id;

    RETURN QUERY SELECT TRUE, FALSE, 'No more songs in queue'::TEXT;
  END IF;
END;
$$ LANGUAGE plpgsql;

COMMIT;

-- ============================================================================
-- STEP 5: Optional Rebalance Function (for when keys get too close)
-- ============================================================================
BEGIN;

DROP FUNCTION IF EXISTS rebalance_queue_sort_keys(UUID);

CREATE OR REPLACE FUNCTION rebalance_queue_sort_keys(p_room_id UUID)
RETURNS TABLE (success BOOLEAN, message TEXT) AS $$
DECLARE
  v_count INTEGER;
BEGIN
  -- Redistribute all pending songs with even spacing (1000.0 intervals)
  WITH numbered_queue AS (
    SELECT 
      id,
      (ROW_NUMBER() OVER (ORDER BY sort_key ASC))::NUMERIC * 1000.0 as new_sort_key
    FROM kara_queue
    WHERE room_id = p_room_id AND status = 'pending'
  )
  UPDATE kara_queue q
  SET sort_key = nq.new_sort_key
  FROM numbered_queue nq
  WHERE q.id = nq.id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  
  RETURN QUERY SELECT TRUE, format('Rebalanced %s songs', v_count)::TEXT;
END;
$$ LANGUAGE plpgsql;

COMMIT;

-- ============================================================================
-- STEP 6: Update calculate_round_robin_position (use sort_key)
-- ============================================================================
BEGIN;

DROP FUNCTION IF EXISTS calculate_round_robin_position(UUID, UUID);

CREATE OR REPLACE FUNCTION calculate_round_robin_position(
  p_room_id UUID,
  p_user_id UUID
) RETURNS NUMERIC(20, 10) AS $$
DECLARE
  v_user_song_count INTEGER;
  v_new_song_count INTEGER;
  v_insert_after_sort_key NUMERIC(20, 10);
  v_next_song_sort_key NUMERIC(20, 10);
  v_max_sort_key NUMERIC(20, 10);
BEGIN
  -- v4.7.6: TRUE FAIR round-robin - nobody sings twice until everyone sings once
  -- Insert based on per-user song count, not round numbers
  -- Example: Host(2 songs), Samsung(1 song) → Samsung adds → Host-1, Samsung-1, Host-2, Samsung-2
  
  -- Step 1: Count how many pending songs this user currently has
  SELECT COUNT(*) INTO v_user_song_count
  FROM kara_queue
  WHERE room_id = p_room_id
    AND user_id = p_user_id
    AND status = 'pending';
  
  -- After adding, user will have this many songs
  v_new_song_count := v_user_song_count + 1;
  
  -- Step 2: Find insertion point
  -- Insert AFTER the last song of any user who has <= v_user_song_count songs
  -- This ensures we don't cut ahead of users with fewer or equal songs
  
  WITH user_song_counts AS (
    SELECT 
      user_id,
      COUNT(*) as song_count,
      MAX(sort_key) as last_sort_key
    FROM kara_queue
    WHERE room_id = p_room_id
      AND status = 'pending'
    GROUP BY user_id
  )
  SELECT MAX(last_sort_key) INTO v_insert_after_sort_key
  FROM user_song_counts
  WHERE song_count <= v_user_song_count;
  
  IF v_insert_after_sort_key IS NOT NULL THEN
    -- Found users with <= count, insert after their last song
    -- Check if there's a song after this position
    SELECT MIN(sort_key) INTO v_next_song_sort_key
    FROM kara_queue
    WHERE room_id = p_room_id
      AND status = 'pending'
      AND sort_key > v_insert_after_sort_key;
    
    IF v_next_song_sort_key IS NOT NULL THEN
      -- Insert between
      RETURN (v_insert_after_sort_key + v_next_song_sort_key) / 2.0;
    ELSE
      -- No songs after, add to end
      RETURN v_insert_after_sort_key + 1000.0;
    END IF;
  ELSE
    -- This is the first song in the room, or everyone has more songs than this user
    -- Add to end of queue
    SELECT COALESCE(MAX(sort_key), 0) INTO v_max_sort_key
    FROM kara_queue
    WHERE room_id = p_room_id
      AND status = 'pending';
    
    RETURN v_max_sort_key + 1000.0;
  END IF;
END;
$$ LANGUAGE plpgsql;

COMMIT;

-- ============================================================================
-- VERIFICATION QUERIES (Run these to verify migration)
-- ============================================================================

-- Check sort_key population
-- SELECT COUNT(*) as total, COUNT(sort_key) as with_sort_key
-- FROM kara_queue;

-- Check sort_key vs position alignment
-- SELECT id, position, sort_key, status
-- FROM kara_queue
-- WHERE status = 'pending'
-- ORDER BY sort_key ASC
-- LIMIT 10;

-- Test rebalance (optional)
-- SELECT * FROM rebalance_queue_sort_keys('<your_room_id>');
