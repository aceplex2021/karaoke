-- Recreate kara_song_history table (was dropped in nuclear migration)
-- Run this in Supabase SQL Editor BEFORE running other fixes

BEGIN;

-- Drop if exists (safety check)
DROP TABLE IF EXISTS kara_song_history CASCADE;

-- Create kara_song_history with NEW schema (version_id instead of song_id)
CREATE TABLE kara_song_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES kara_rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES kara_users(id) ON DELETE CASCADE,
  version_id UUID NOT NULL REFERENCES kara_versions(id) ON DELETE CASCADE,
  sung_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  times_sung INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_history_room_id ON kara_song_history(room_id);
CREATE INDEX idx_history_user_id ON kara_song_history(user_id);
CREATE INDEX idx_history_version_id ON kara_song_history(version_id);
CREATE INDEX idx_history_sung_at ON kara_song_history(sung_at DESC);

-- Unique constraint: one history entry per room/user/version
CREATE UNIQUE INDEX idx_history_room_user_version 
  ON kara_song_history(room_id, user_id, version_id);

-- Enable RLS (Row Level Security)
ALTER TABLE kara_song_history ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Allow all operations for authenticated and anon users
CREATE POLICY "Enable all for authenticated and anon users" 
  ON kara_song_history 
  FOR ALL 
  TO authenticated, anon 
  USING (true) 
  WITH CHECK (true);

COMMIT;

-- Verify table was created
SELECT 
  table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'kara_song_history'
ORDER BY ordinal_position;
