-- Add metadata JSONB column to kara_queue for YouTube video info
-- This stores title, description, thumbnail, etc. from YouTube share

BEGIN;

-- Add metadata column
ALTER TABLE kara_queue
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN kara_queue.metadata IS 'YouTube video metadata (title, thumbnail, duration, etc.)';

-- Create index for metadata queries
CREATE INDEX IF NOT EXISTS idx_queue_metadata 
  ON kara_queue USING GIN (metadata);

-- Reload schema cache for PostgREST
NOTIFY pgrst, 'reload schema';

COMMIT;

/*
Usage:
{
  "title": "Hotel California Karaoke",
  "thumbnail": "https://i.ytimg.com/...",
  "duration": 240,
  "channel": "Karaoke Channel"
}
*/
