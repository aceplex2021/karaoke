-- Simple migration: Fix existing round_numbers for round-robin mode
-- This recalculates round_number for all pending songs based on user order
-- Expected result: A1 (round 1), B1 (round 1), A2 (round 2), B2 (round 2), A3 (round 3), A4 (round 4)

-- For room: a4b788e3-08b8-43ab-93df-9799c78ca886
-- User A (62e4179f-b1f2-4dee-a795-41d68688de3b) has 4 songs at positions 1, 2, 3, 5
-- User B (cb6e867c-99d3-49a5-b174-12813164774f) has 2 songs at positions 4, 6

-- Expected round_numbers after fix:
-- Position 1 (A): round_number = 1
-- Position 2 (A): round_number = 2  
-- Position 3 (A): round_number = 3
-- Position 4 (B): round_number = 1
-- Position 5 (A): round_number = 4
-- Position 6 (B): round_number = 2

-- Manual update (adjust based on your actual data):
UPDATE kara_queue
SET round_number = 1
WHERE id = '7b8318a7-19cd-4ae0-aa97-0d2b0c80e81e' -- A's first song (position 1)
AND room_id = 'a4b788e3-08b8-43ab-93df-9799c78ca886';

UPDATE kara_queue
SET round_number = 1
WHERE id = '5280f6a6-9ba1-4dc7-8ad4-35417f53705c' -- B's first song (position 4)
AND room_id = 'a4b788e3-08b8-43ab-93df-9799c78ca886';

UPDATE kara_queue
SET round_number = 2
WHERE id = '896485e4-f9fb-4417-b3db-3f3d77c687c4' -- A's second song (position 2)
AND room_id = 'a4b788e3-08b8-43ab-93df-9799c78ca886';

UPDATE kara_queue
SET round_number = 2
WHERE id = '738c7a34-fdbe-4db6-9740-da6312050333' -- B's second song (position 6)
AND room_id = 'a4b788e3-08b8-43ab-93df-9799c78ca886';

UPDATE kara_queue
SET round_number = 3
WHERE id = '03414c00-299f-455e-898e-94044988d599' -- A's third song (position 3)
AND room_id = 'a4b788e3-08b8-43ab-93df-9799c78ca886';

UPDATE kara_queue
SET round_number = 4
WHERE id = '0c34e9d8-7d81-4d06-8c61-56bfcbe90587' -- A's fourth song (position 5)
AND room_id = 'a4b788e3-08b8-43ab-93df-9799c78ca886';

-- Verification:
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
-- 
-- Expected result:
-- round_number=1, position=1 (A)
-- round_number=1, position=4 (B)
-- round_number=2, position=2 (A)
-- round_number=2, position=6 (B)
-- round_number=3, position=3 (A)
-- round_number=4, position=5 (A)
