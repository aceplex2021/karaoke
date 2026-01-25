-- ============================================
-- v5.0: Fix Room Expiry (Phase 1)
-- ============================================
-- Date: 2026-01-24
-- Purpose: Fix rooms not expiring after 24 hours
-- 
-- Fixes:
-- 1. Set default value for expires_at column
-- 2. Backfill existing rooms with proper expires_at
-- 3. Set up scheduled job to expire old rooms
-- ============================================

-- ============================================
-- Step 0: Analyze Current Room State (Before Migration)
-- ============================================

-- Run this query first to understand the scope:
-- SELECT 
--   CASE 
--     WHEN created_at < NOW() - INTERVAL '24 hours' THEN 'Old (>24h ago)'
--     WHEN created_at >= NOW() - INTERVAL '24 hours' THEN 'Recent (<24h ago)'
--   END as age_category,
--   is_active,
--   COUNT(*) as total_rooms,
--   COUNT(*) FILTER (WHERE expires_at IS NULL) as missing_expires_at,
--   MIN(created_at) as oldest_room,
--   MAX(created_at) as newest_room
-- FROM kara_rooms
-- GROUP BY age_category, is_active
-- ORDER BY age_category, is_active;

-- ============================================
-- Step 1: Backfill Existing Rooms (Comprehensive Fix)
-- ============================================

-- Category 1: Rooms created > 24 hours ago → Expire immediately
UPDATE kara_rooms
SET expires_at = NOW(),
    is_active = false
WHERE expires_at IS NULL
AND is_active = true
AND created_at < NOW() - INTERVAL '24 hours';

-- Category 2: Rooms created < 24 hours ago → Set proper expiry
UPDATE kara_rooms
SET expires_at = created_at + INTERVAL '24 hours'
WHERE expires_at IS NULL
AND is_active = true
AND created_at >= NOW() - INTERVAL '24 hours';

-- Category 3: Rooms already inactive but missing expires_at → Set for consistency
UPDATE kara_rooms
SET expires_at = created_at + INTERVAL '24 hours'
WHERE expires_at IS NULL
AND is_active = false;

-- Verify backfill results
SELECT 
  CASE 
    WHEN created_at < NOW() - INTERVAL '24 hours' THEN 'Old (>24h)'
    WHEN created_at >= NOW() - INTERVAL '24 hours' THEN 'Recent (<24h)'
  END as age_category,
  is_active,
  COUNT(*) as count,
  COUNT(*) FILTER (WHERE expires_at IS NULL) as missing_expires_at
FROM kara_rooms
GROUP BY age_category, is_active
ORDER BY age_category, is_active;

-- ============================================
-- Step 2: Add Default Value for expires_at
-- ============================================

ALTER TABLE kara_rooms
  ALTER COLUMN expires_at 
  SET DEFAULT (NOW() + INTERVAL '24 hours');

-- Verify default was set
SELECT 
  column_name, 
  column_default, 
  is_nullable 
FROM information_schema.columns 
WHERE table_name = 'kara_rooms' 
AND column_name = 'expires_at';

-- ============================================
-- Step 3: Verify expire_old_rooms() Function Exists
-- ============================================

-- Check if function exists
SELECT routine_name, routine_type 
FROM information_schema.routines 
WHERE routine_name = 'expire_old_rooms'
AND routine_schema = 'public';

-- If function doesn't exist, create it:
-- CREATE OR REPLACE FUNCTION expire_old_rooms()
-- RETURNS void AS $$
-- BEGIN
--   UPDATE kara_rooms
--   SET is_active = false
--   WHERE expires_at < NOW()
--   AND is_active = true;
-- END;
-- $$ LANGUAGE plpgsql;

-- ============================================
-- Step 4: Set Up Scheduled Job (pg_cron)
-- ============================================

-- Enable pg_cron extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Remove existing job if it exists (to avoid duplicates)
SELECT cron.unschedule('expire-old-rooms') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'expire-old-rooms'
);

-- Schedule job to run every hour at minute 0
SELECT cron.schedule(
  'expire-old-rooms',
  '0 * * * *',  -- Cron format: minute hour day month weekday (every hour at minute 0)
  $$SELECT expire_old_rooms();$$
);

-- Verify job is scheduled
SELECT jobid, schedule, command, active 
FROM cron.job 
WHERE jobname = 'expire-old-rooms';

-- ============================================
-- Step 5: Manual Test (Optional)
-- ============================================

-- Test the function manually (should expire rooms where expires_at < NOW())
-- SELECT expire_old_rooms();

-- Check how many rooms would be expired
-- SELECT COUNT(*) 
-- FROM kara_rooms 
-- WHERE expires_at < NOW() 
-- AND is_active = true;

-- ============================================
-- Notes
-- ============================================
-- 
-- This migration:
-- 1. Backfills existing rooms with proper expires_at values
-- 2. Sets default value so new rooms automatically get expires_at
-- 3. Sets up hourly scheduled job to expire old rooms
-- 
-- Application code changes (separate):
-- - Room creation explicitly sets expires_at (redundant but safe)
-- - Room access endpoints check expires_at before allowing access
-- 
-- If pg_cron is not available in Supabase:
-- - Use external cron service (Vercel Cron, cron-job.org, etc.)
-- - Call /api/cron/expire-rooms endpoint hourly
-- ============================================
