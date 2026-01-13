-- Migration: Add version_id to kara_queue (Simplify data model)
-- Date: 2026-01-13
-- Purpose: Store version_id only (not song_id) for single source of truth

-- Step 1: Add version_id column
ALTER TABLE kara_queue 
ADD COLUMN IF NOT EXISTS version_id UUID REFERENCES kara_versions(id);

-- Step 2: Make song_id nullable (we're moving to version_id only)
ALTER TABLE kara_queue 
ALTER COLUMN song_id DROP NOT NULL;

-- Step 3: Backfill existing data (one-time migration)
-- Get the first version for each song
UPDATE kara_queue q
SET version_id = (
  SELECT v.id 
  FROM kara_versions v 
  WHERE v.song_id = q.song_id 
  ORDER BY v.created_at
  LIMIT 1
)
WHERE version_id IS NULL AND song_id IS NOT NULL;

-- Step 4: Add NOT NULL constraint to version_id after backfill
-- (Run this separately after verifying backfill worked)
-- ALTER TABLE kara_queue ALTER COLUMN version_id SET NOT NULL;

-- Step 5: In future, can drop song_id column after migration validated
-- (Keep for now for safety, can remove in next release)
-- ALTER TABLE kara_queue DROP COLUMN song_id;

-- Verification query:
-- SELECT 
--   COUNT(*) as total_entries,
--   COUNT(version_id) as with_version_id,
--   COUNT(song_id) as with_song_id
-- FROM kara_queue;
