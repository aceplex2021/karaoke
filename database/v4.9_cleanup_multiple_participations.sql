-- ============================================
-- v4.9: Cleanup Multiple Room Participations
-- ============================================
-- Date: 2026-01-24
-- Purpose: Phase 2 - Fix stuck in room issue
-- 
-- This migration cleans up users who are participants
-- in multiple rooms simultaneously.
-- ============================================

-- ============================================
-- Step 1: Analyze Current State
-- ============================================

-- Check users in multiple rooms
SELECT 
  user_id, 
  COUNT(*) as room_count,
  ARRAY_AGG(room_id ORDER BY last_active_at DESC) as room_ids,
  ARRAY_AGG(last_active_at ORDER BY last_active_at DESC) as last_active_times
FROM kara_room_participants
WHERE status = 'approved'
GROUP BY user_id
HAVING COUNT(*) > 1
ORDER BY room_count DESC;

-- ============================================
-- Step 2: Cleanup Strategy
-- ============================================
-- 
-- Option A: Keep only most recent room per user
--   - Keeps the room user was last active in
--   - Removes all older participations
--
-- Option B: Keep only rooms active in last hour
--   - Keeps rooms user was active in recently
--   - Removes stale participations (>1 hour inactive)
--
-- We'll use Option A (most recent) as it's simpler
-- and aligns with "one active room per user" concept
-- ============================================

-- ============================================
-- Step 3: Cleanup Multiple Participations
-- ============================================

-- Delete all participations except the most recent one per user
WITH ranked_participations AS (
  SELECT 
    id,
    user_id,
    room_id,
    last_active_at,
    ROW_NUMBER() OVER (
      PARTITION BY user_id 
      ORDER BY last_active_at DESC NULLS LAST, joined_at DESC
    ) as rn
  FROM kara_room_participants
  WHERE status = 'approved'
)
DELETE FROM kara_room_participants
WHERE id IN (
  SELECT id 
  FROM ranked_participations 
  WHERE rn > 1
);

-- ============================================
-- Step 4: Verify Cleanup
-- ============================================

-- Should return 0 rows (no users in multiple rooms)
SELECT 
  user_id, 
  COUNT(*) as room_count
FROM kara_room_participants
WHERE status = 'approved'
GROUP BY user_id
HAVING COUNT(*) > 1;

-- Show summary
SELECT 
  'Total users' as metric,
  COUNT(DISTINCT user_id) as count
FROM kara_room_participants
WHERE status = 'approved'
UNION ALL
SELECT 
  'Total participations',
  COUNT(*)
FROM kara_room_participants
WHERE status = 'approved';

-- ============================================
-- Notes
-- ============================================
-- 
-- This cleanup is safe because:
-- 1. Users can rejoin any room anytime with room code
-- 2. We're keeping their most recent participation
-- 3. No data loss - just removing duplicate participations
-- 
-- After this cleanup, the join endpoint will automatically
-- prevent multiple participations by cleaning up old ones
-- before adding new participation.
-- ============================================
