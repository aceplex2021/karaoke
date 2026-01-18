-- ============================================
-- ROLLBACK: Recreate dropped unused tables
-- ============================================
-- Only run this if you need to restore the tables
-- that were dropped by drop_unused_tables.sql
-- ============================================

-- Recreate kara_artists
CREATE TABLE IF NOT EXISTS kara_artists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR NOT NULL,
  normalized_name VARCHAR NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS kara_artists_normalized_name_key ON kara_artists(normalized_name);

-- Recreate kara_lyrics
CREATE TABLE IF NOT EXISTS kara_lyrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  song_id UUID NOT NULL REFERENCES kara_songs(id) ON DELETE CASCADE,
  language_id UUID REFERENCES kara_languages(id),
  format VARCHAR,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Recreate kara_tags
CREATE TABLE IF NOT EXISTS kara_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Recreate kara_song_tags
CREATE TABLE IF NOT EXISTS kara_song_tags (
  song_id UUID NOT NULL REFERENCES kara_songs(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES kara_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (song_id, tag_id)
);

-- Restore foreign key on kara_songs
ALTER TABLE kara_songs 
ADD CONSTRAINT kara_songs_artist_id_fkey 
FOREIGN KEY (artist_id) REFERENCES kara_artists(id);
