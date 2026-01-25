-- ============================================
-- v4.9: Cleanup Stale Participations (Phase 2.1)
-- ============================================
-- Date: 2026-01-24
-- Purpose: Solution 4 - Scheduled cleanup of stale participations
-- 
-- Removes participations where user hasn't been active for >24 hours
-- Safety net for users who forget to click "Leave Room" button
-- ============================================

-- ============================================
-- Step 1: Create Cleanup Function
-- ============================================

CREATE OR REPLACE FUNCTION cleanup_stale_participations()
RETURNS TABLE(deleted_count INTEGER) AS $$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  -- Delete stale participations (>24 hours inactive)
  -- Never remove hosts (they own the room)
  WITH deleted AS (
    DELETE FROM kara_room_participants
    WHERE status = 'approved'
    AND role != 'host'  -- Never remove hosts
    AND (
      last_active_at IS NULL 
      OR last_active_at < NOW() - INTERVAL '24 hours'
    )
    RETURNING id
  )
  SELECT COUNT(*) INTO v_deleted_count FROM deleted;
  
  RETURN QUERY SELECT v_deleted_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_stale_participations IS 'Phase 2.1: Remove participations inactive >24 hours (safety net for users who forget to leave)';

GRANT EXECUTE ON FUNCTION cleanup_stale_participations() TO authenticated, anon, service_role;

-- ============================================
-- Step 2: Schedule Cleanup Job (pg_cron)
-- ============================================

-- Enable pg_cron extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule job to run every hour at minute 0
-- Remove existing job if it exists
SELECT cron.unschedule('cleanup-stale-participations') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'cleanup-stale-participations'
);

-- Create new scheduled job
SELECT cron.schedule(
  'cleanup-stale-participations',
  '0 * * * *',  -- Every hour at minute 0
  $$SELECT cleanup_stale_participations();$$
);

-- ============================================
-- Step 3: Verify Setup
-- ============================================

-- Check function exists
SELECT routine_name, routine_type 
FROM information_schema.routines 
WHERE routine_name = 'cleanup_stale_participations'
AND routine_schema = 'public';

-- Check job is scheduled
SELECT jobid, schedule, command, active 
FROM cron.job 
WHERE jobname = 'cleanup-stale-participations';

-- ============================================
-- Step 4: Manual Test (Optional)
-- ============================================

-- Test the function manually (returns count of deleted participations)
-- SELECT * FROM cleanup_stale_participations();

-- ============================================
-- Step 5: Analyze Before Cleanup
-- ============================================

-- Check how many stale participations exist
SELECT 
  COUNT(*) as stale_count,
  COUNT(*) FILTER (WHERE last_active_at IS NULL) as null_last_active,
  COUNT(*) FILTER (WHERE last_active_at < NOW() - INTERVAL '24 hours') as inactive_24h_plus,
  MIN(last_active_at) as oldest_active,
  MAX(last_active_at) as newest_active
FROM kara_room_participants
WHERE status = 'approved'
AND role != 'host'
AND (last_active_at IS NULL OR last_active_at < NOW() - INTERVAL '24 hours');

-- ============================================
-- Notes
-- ============================================
-- 
-- This cleanup function:
-- 1. Only removes participations inactive >24 hours
-- 2. Never removes hosts (they own the room)
-- 3. Runs hourly via pg_cron
-- 4. Works as safety net for edge cases
-- 
-- The main cleanup happens in /api/rooms/join (smart cleanup)
-- This scheduled job catches cases where user never joins another room
-- ============================================
