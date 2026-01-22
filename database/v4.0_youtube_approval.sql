-- ============================================
-- v4.0 Migration: YouTube & Approval Support
-- File: database/v4.0_youtube_approval.sql
-- Created: 2026-01-12
-- ============================================

-- IMPORTANT: This migration is BACKWARD COMPATIBLE
-- - Existing v3.5 functionality will continue working
-- - New columns have defaults
-- - No data loss

-- ============================================
-- HOW TO RUN THIS MIGRATION
-- ============================================
-- 
-- STEP 1: DRY RUN (Test first - RECOMMENDED)
--   1. Copy this entire file
--   2. Find line "COMMIT;" near line 173
--   3. Change "COMMIT;" to "ROLLBACK;"
--   4. Run in Supabase SQL Editor
--   5. Check for errors
--   6. All changes will be undone automatically
--
-- STEP 2: ACTUAL MIGRATION (After successful dry run)
--   1. Copy this entire file again
--   2. Keep "COMMIT;" as-is (near line 173)
--   3. Run in Supabase SQL Editor
--   4. Changes will be saved to database
--
-- ============================================

BEGIN;

-- ============================================
-- 1. Update kara_rooms (add approval mode and expiry)
-- ============================================

ALTER TABLE kara_rooms 
ADD COLUMN IF NOT EXISTS approval_mode TEXT 
  CHECK (approval_mode IN ('auto', 'approval')) 
  DEFAULT 'auto',
ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ 
  DEFAULT (NOW() + INTERVAL '24 hours');

-- Update existing rooms to have expiry
UPDATE kara_rooms 
SET expires_at = created_at + INTERVAL '24 hours'
WHERE expires_at IS NULL;

COMMENT ON COLUMN kara_rooms.approval_mode IS 'auto = users join immediately, approval = host must approve';
COMMENT ON COLUMN kara_rooms.expires_at IS 'Room auto-deactivates after 24 hours';

-- ============================================
-- 2. Update kara_queue (add YouTube support)
-- ============================================

ALTER TABLE kara_queue
ADD COLUMN IF NOT EXISTS youtube_url TEXT,
ADD COLUMN IF NOT EXISTS source_type TEXT 
  CHECK (source_type IN ('database', 'youtube')) 
  DEFAULT 'database';

-- Add constraint: either version_id OR youtube_url, not both
ALTER TABLE kara_queue
DROP CONSTRAINT IF EXISTS check_queue_source;

ALTER TABLE kara_queue
ADD CONSTRAINT check_queue_source CHECK (
  (source_type = 'database' AND version_id IS NOT NULL AND youtube_url IS NULL) OR
  (source_type = 'youtube' AND youtube_url IS NOT NULL AND version_id IS NULL)
);

-- Make version_id nullable for YouTube entries
ALTER TABLE kara_queue 
ALTER COLUMN version_id DROP NOT NULL;

COMMENT ON COLUMN kara_queue.youtube_url IS 'YouTube video URL (e.g., https://youtube.com/watch?v=xxxxx)';
COMMENT ON COLUMN kara_queue.source_type IS 'database = local video file, youtube = YouTube video';

-- ============================================
-- 3. Update kara_room_participants (add approval tracking)
-- ============================================

ALTER TABLE kara_room_participants
ADD COLUMN IF NOT EXISTS role TEXT 
  CHECK (role IN ('host', 'tv', 'user')) 
  DEFAULT 'user',
ADD COLUMN IF NOT EXISTS status TEXT 
  CHECK (status IN ('approved', 'pending', 'denied')) 
  DEFAULT 'approved',
ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

COMMENT ON COLUMN kara_room_participants.role IS 'host = room creator, tv = media player, user = guest';
COMMENT ON COLUMN kara_room_participants.status IS 'approved = can add songs, pending = waiting for host, denied = rejected';
COMMENT ON COLUMN kara_room_participants.approved_at IS 'When host approved this user';
COMMENT ON COLUMN kara_room_participants.expires_at IS 'Pending approvals expire after 15 minutes';

-- Index for fast approval lookups
CREATE INDEX IF NOT EXISTS idx_participants_status 
  ON kara_room_participants(status);
CREATE INDEX IF NOT EXISTS idx_participants_role 
  ON kara_room_participants(role);

-- ============================================
-- 4. Function: Expire pending approvals
-- ============================================

CREATE OR REPLACE FUNCTION expire_pending_approvals()
RETURNS void AS $$
BEGIN
  UPDATE kara_room_participants
  SET status = 'denied'
  WHERE status = 'pending'
  AND expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION expire_pending_approvals IS 'Auto-deny pending approvals after 15 minutes';

GRANT EXECUTE ON FUNCTION expire_pending_approvals() 
  TO authenticated, anon, service_role;

-- ============================================
-- 5. Function: Expire old rooms
-- ============================================

CREATE OR REPLACE FUNCTION expire_old_rooms()
RETURNS void AS $$
BEGIN
  UPDATE kara_rooms
  SET is_active = false
  WHERE expires_at < NOW()
  AND is_active = true;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION expire_old_rooms IS 'Auto-deactivate rooms after 24 hours';

GRANT EXECUTE ON FUNCTION expire_old_rooms() 
  TO authenticated, anon, service_role;

-- ============================================
-- 6. Verification Queries
-- ============================================

-- Check kara_rooms columns
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_name = 'kara_rooms'
AND column_name IN ('approval_mode', 'expires_at')
ORDER BY column_name;

-- Check kara_queue columns
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_name = 'kara_queue'
AND column_name IN ('youtube_url', 'source_type')
ORDER BY column_name;

-- Check kara_room_participants columns
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_name = 'kara_room_participants'
AND column_name IN ('role', 'status', 'approved_at', 'expires_at')
ORDER BY column_name;

-- Check constraints
SELECT constraint_name, table_name
FROM information_schema.table_constraints
WHERE table_name IN ('kara_rooms', 'kara_queue', 'kara_room_participants')
AND constraint_type = 'CHECK'
ORDER BY table_name, constraint_name;

-- Check indexes
SELECT indexname, tablename
FROM pg_indexes
WHERE tablename = 'kara_room_participants'
AND indexname LIKE 'idx_participants%'
ORDER BY indexname;

-- Check functions
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_name IN ('expire_pending_approvals', 'expire_old_rooms')
ORDER BY routine_name;

-- ============================================
-- IMPORTANT: Choose one of the following
-- ============================================

-- For DRY RUN (test without saving):
-- ROLLBACK;

-- For ACTUAL MIGRATION (save changes):
COMMIT;

-- ============================================
-- ROLLBACK SCRIPT (if you need to undo later)
-- ============================================
/*
BEGIN;

-- Drop functions
DROP FUNCTION IF EXISTS expire_old_rooms();
DROP FUNCTION IF EXISTS expire_pending_approvals();

-- Drop indexes
DROP INDEX IF EXISTS idx_participants_role;
DROP INDEX IF EXISTS idx_participants_status;

-- Drop columns from kara_room_participants
ALTER TABLE kara_room_participants
DROP COLUMN IF EXISTS expires_at,
DROP COLUMN IF EXISTS approved_at,
DROP COLUMN IF EXISTS status,
DROP COLUMN IF EXISTS role;

-- Drop constraint from kara_queue
ALTER TABLE kara_queue
DROP CONSTRAINT IF EXISTS check_queue_source;

-- Make version_id required again
ALTER TABLE kara_queue 
ALTER COLUMN version_id SET NOT NULL;

-- Drop columns from kara_queue
ALTER TABLE kara_queue
DROP COLUMN IF EXISTS source_type,
DROP COLUMN IF EXISTS youtube_url;

-- Drop columns from kara_rooms
ALTER TABLE kara_rooms
DROP COLUMN IF EXISTS expires_at,
DROP COLUMN IF EXISTS approval_mode;

COMMIT;
*/

-- ============================================
-- TEST QUERIES (after migration)
-- ============================================

-- Test 1: Create a room with approval mode
/*
INSERT INTO kara_rooms (code, host_name, is_active, approval_mode)
VALUES ('TEST123', 'Test Host', true, 'approval')
RETURNING *;
*/

-- Test 2: Add a YouTube song to queue
/*
INSERT INTO kara_queue (
  room_id, 
  user_id, 
  user_name,
  title,
  artist,
  position,
  source_type,
  youtube_url
)
VALUES (
  1,  -- room_id
  'test-user-id',
  'Test User',
  'Test Song',
  'Test Artist',
  1,
  'youtube',
  'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
)
RETURNING *;
*/

-- Test 3: Add a pending user
/*
INSERT INTO kara_room_participants (
  room_id,
  user_id,
  user_name,
  role,
  status,
  expires_at
)
VALUES (
  1,  -- room_id
  'pending-user-id',
  'Pending User',
  'user',
  'pending',
  NOW() + INTERVAL '15 minutes'
)
RETURNING *;
*/

-- Test 4: Expire pending approvals
/*
SELECT expire_pending_approvals();
SELECT * FROM kara_room_participants WHERE status = 'denied';
*/

-- Test 5: Expire old rooms
/*
SELECT expire_old_rooms();
SELECT * FROM kara_rooms WHERE is_active = false;
*/
