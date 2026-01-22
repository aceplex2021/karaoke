-- ============================================
-- v4.1 Fix: Add missing user_name column for approval system
-- File: database/v4.1_fix_approval.sql
-- ============================================

-- Add user_name column to kara_room_participants for faster approval queries
-- This column stores a cached copy of the user's display name at join time
-- This avoids needing to JOIN with kara_users for approval lists

ALTER TABLE kara_room_participants
ADD COLUMN IF NOT EXISTS user_name VARCHAR(255);

-- Backfill existing rows with display_name from kara_users
UPDATE kara_room_participants p
SET user_name = u.display_name
FROM kara_users u
WHERE p.user_id = u.id
AND p.user_name IS NULL;

-- Add comment
COMMENT ON COLUMN kara_room_participants.user_name IS 'Cached display name at join time (for faster approval queries)';

-- Verification query
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'kara_room_participants'
AND column_name = 'user_name';
