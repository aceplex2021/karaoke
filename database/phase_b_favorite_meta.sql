-- Stable YouTube favorites metadata (title/url keyed by youtube:VIDEO_ID)
ALTER TABLE kara_user_preferences
  ADD COLUMN IF NOT EXISTS favorite_meta JSONB DEFAULT '{}'::jsonb;
