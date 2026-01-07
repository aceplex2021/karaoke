-- Quick SQL to add your test song
-- Run this in Supabase SQL Editor

INSERT INTO kara_songs (title, file_path, language)
VALUES (
    'BIỂN NHỚ',
    'BIỂN NHỚ - KARAOKE - Tone NAM ( Gm⧸Sol Thứ ).mp4',
    'vi'
)
ON CONFLICT DO NOTHING;

-- Verify it was added
SELECT * FROM kara_songs WHERE title = 'BIỂN NHỚ';

-- To add more songs, repeat the INSERT with different values:
-- INSERT INTO kara_songs (title, file_path, language, artist)
-- VALUES ('Song Title', 'filename.mp4', 'en', 'Artist Name');

