-- Add favorite_song_ids column to kara_user_preferences
-- Store favorite song IDs as JSONB array
-- Date: 2026-01-12

ALTER TABLE kara_user_preferences 
ADD COLUMN IF NOT EXISTS favorite_song_ids JSONB DEFAULT '[]'::jsonb;

-- Add GIN index for efficient JSONB queries
CREATE INDEX IF NOT EXISTS idx_user_preferences_favorite_song_ids 
ON kara_user_preferences USING GIN (favorite_song_ids);

-- Add comment
COMMENT ON COLUMN kara_user_preferences.favorite_song_ids IS 
  'Array of favorite song IDs stored as JSONB: ["uuid1", "uuid2", ...]';
