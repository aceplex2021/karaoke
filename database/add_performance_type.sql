-- ============================================
-- ADD PERFORMANCE TYPE TO KARA_SONGS
-- ============================================
-- Adds performance_type column to track solo/duet/group/medley
-- Date: January 17, 2026
-- ============================================

BEGIN;

-- Add performance_type column
ALTER TABLE kara_songs 
ADD COLUMN IF NOT EXISTS performance_type TEXT;

-- Create index for performance_type
CREATE INDEX IF NOT EXISTS idx_songs_performance_type 
ON kara_songs(performance_type);

-- Add comment
COMMENT ON COLUMN kara_songs.performance_type IS 
'Performance format: solo, duet, group, or medley';

-- Create detection function
CREATE OR REPLACE FUNCTION detect_performance_type(
  version_label TEXT,
  song_title TEXT
) RETURNS TEXT AS $$
BEGIN
  -- Check label first (most reliable)
  IF version_label ~* 'song.?ca' THEN
    RETURN 'duet';
  END IF;
  
  -- Check title for medley
  IF song_title ~* 'lien.?khuc' OR song_title ~ 'Liên Khúc' THEN
    RETURN 'medley';
  END IF;
  
  -- Check title for group performance
  IF song_title ~* 'hop.?ca' OR song_title ~ 'Hợp Ca' THEN
    RETURN 'group';
  END IF;
  
  -- Default to solo
  RETURN 'solo';
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Populate performance_type
-- We need to pick one version per song to determine type
-- Use the default version if available, otherwise any version
UPDATE kara_songs s
SET performance_type = detect_performance_type(
  COALESCE(
    (SELECT v.label 
     FROM kara_versions v 
     WHERE v.song_id = s.id AND v.is_default = true 
     LIMIT 1),
    (SELECT v.label 
     FROM kara_versions v 
     WHERE v.song_id = s.id 
     LIMIT 1)
  ),
  s.title
);

-- Show statistics
SELECT 
  '=== PERFORMANCE TYPE STATISTICS ===' as section,
  performance_type,
  COUNT(*) as count,
  ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM kara_songs), 1) || '%' as percentage
FROM kara_songs
GROUP BY performance_type
ORDER BY COUNT(*) DESC;

-- Sample of each type
SELECT 
  '=== SAMPLE BY TYPE ===' as section,
  performance_type,
  title,
  artist_name
FROM (
  SELECT DISTINCT ON (performance_type)
    performance_type,
    title,
    artist_name
  FROM kara_songs
  WHERE performance_type IS NOT NULL
  ORDER BY performance_type, RANDOM()
) sub
ORDER BY performance_type;

COMMIT;
