-- ============================================
-- ADD ARTIST_NAME COLUMN TO KARA_SONGS
-- ============================================
-- Adds artist_name column for future artist extraction
-- This column will be populated in a separate task
-- ============================================

-- Add artist_name column
ALTER TABLE kara_songs 
ADD COLUMN IF NOT EXISTS artist_name TEXT;

-- Add index for searching by artist
CREATE INDEX IF NOT EXISTS idx_songs_artist_name ON kara_songs(artist_name);

-- Add comment
COMMENT ON COLUMN kara_songs.artist_name IS 'Artist name extracted from storage_path or manually entered. Will be populated in separate task.';

-- Verify column was added
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'kara_songs' AND column_name = 'artist_name';
