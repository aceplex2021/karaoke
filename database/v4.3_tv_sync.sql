-- =====================================================
-- V4.3: Multi-TV Display Support
-- =====================================================
-- Adds support for primary/secondary TV displays.
-- Primary TV has audio, secondary TVs are muted.
-- All TVs start playback simultaneously from 0:00.
-- =====================================================

-- Add primary_tv_id to track which TV has audio
ALTER TABLE kara_rooms
ADD COLUMN IF NOT EXISTS primary_tv_id UUID;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_rooms_primary_tv 
ON kara_rooms(primary_tv_id);

-- Add comment for documentation
COMMENT ON COLUMN kara_rooms.primary_tv_id IS 
  'ID of the primary TV display (has audio). First TV to connect becomes primary. Secondary TVs are muted.';

-- =====================================================
-- Migration Notes:
-- - primary_tv_id: Set by first TV that connects to /tv page
-- - All TVs detect song changes via polling and start from 0:00
-- - Only primary TV has audio enabled (secondary TVs muted)
-- - Column nullable for backward compatibility
-- =====================================================
