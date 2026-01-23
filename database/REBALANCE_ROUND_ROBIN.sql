-- ============================================================================
-- Rebalance Existing Queue for Round-Robin
-- ============================================================================
-- This recalculates sort_keys for existing songs based on round_number
-- Run this AFTER running v4.7.0_sort_key_optimization.sql
--
-- IMPORTANT: Replace '<your_room_id>' with your actual room ID
-- ============================================================================

-- Step 1: Find your room_id (if you don't know it)
-- SELECT id, room_code, room_name FROM kara_rooms WHERE room_code = 'YOUR_ROOM_CODE';

-- Step 2: Rebalance the queue for TRUE FAIR round-robin (v4.8.0 - Option B)
-- Algorithm: Use clear round boundaries with multiplication
--   Round 1: sort_key 1000-999999
--   Round 2: sort_key 1000000-1999999
--   Round 3: sort_key 2000000-2999999
-- This ensures rounds NEVER overlap in sort order
BEGIN;

WITH user_songs AS (
  -- Number each user's songs (1st, 2nd, 3rd, etc.)
  -- Use added_at to determine original add order
  SELECT 
    id,
    user_id,
    added_at,
    ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY added_at ASC) as user_song_num
  FROM kara_queue
  WHERE room_id = '585d9af4-8ddc-4158-bb1f-d43d264d1be8'
    AND status = 'pending'
),
rebalanced AS (
  SELECT 
    id,
    user_song_num as round_number,
    added_at,
    -- v4.8.0: Option B - Clear round boundaries using multiplication
    -- Formula: sort_key = (round_number - 1) * 1000000 + position_within_round * 1000
    -- Round 1 songs: 1000-999999
    -- Round 2 songs: 1000000-1999999
    -- Round 3 songs: 2000000-2999999
    -- This ensures Round 1 < Round 2 < Round 3 ALWAYS
    (
      (user_song_num - 1)::NUMERIC * 1000000.0 + 
      (ROW_NUMBER() OVER (
        PARTITION BY user_song_num 
        ORDER BY added_at ASC
      ))::NUMERIC * 1000.0
    ) as new_sort_key
  FROM user_songs
)
UPDATE kara_queue q
SET 
  sort_key = r.new_sort_key,
  round_number = r.round_number  -- v4.8.0: Fixed round numbers
FROM rebalanced r
WHERE q.id = r.id;

-- Step 3: Update position numbers to match sort_key order
WITH numbered_queue AS (
  SELECT 
    id,
    ROW_NUMBER() OVER (ORDER BY sort_key ASC) as new_pos
  FROM kara_queue
  WHERE room_id = '585d9af4-8ddc-4158-bb1f-d43d264d1be8'
    AND status = 'pending'
)
UPDATE kara_queue q
SET position = nq.new_pos
FROM numbered_queue nq
WHERE q.id = nq.id;

COMMIT;

-- Step 4: Verify the new order
SELECT 
  position,
  round_number,
  SUBSTRING(metadata->>'title', 1, 30) as title,
  (SELECT display_name FROM kara_users WHERE id = kara_queue.user_id) as user_name,
  sort_key
FROM kara_queue
WHERE room_id = '585d9af4-8ddc-4158-bb1f-d43d264d1be8'
  AND status = 'pending'
ORDER BY sort_key ASC;

-- Expected result: Songs grouped by round_number (1,1,2,2,3,4), not by user
