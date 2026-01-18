-- Backfill script: Create history entries for existing completed songs
-- This will create history entries for songs that completed before the fix was applied
-- Run this AFTER applying the updated advance_playback function

-- Step 1: Create history entries for completed songs that have song_id directly
INSERT INTO kara_song_history (room_id, user_id, song_id, sung_at, times_sung)
SELECT 
    q.room_id,
    q.user_id,
    q.song_id,
    COALESCE(q.completed_at, q.started_at, q.added_at) as sung_at,
    1 as times_sung
FROM kara_queue q
WHERE q.status = 'completed'
    AND q.song_id IS NOT NULL
    AND q.completed_at IS NOT NULL
    -- Only insert if history entry doesn't already exist
    AND NOT EXISTS (
        SELECT 1 
        FROM kara_song_history h 
        WHERE h.room_id = q.room_id 
            AND h.user_id = q.user_id 
            AND h.song_id = q.song_id
            AND h.sung_at = COALESCE(q.completed_at, q.started_at, q.added_at)
    )
ON CONFLICT DO NOTHING;

-- Step 2: Create history entries for completed songs that have version_id (get song_id from version)
INSERT INTO kara_song_history (room_id, user_id, song_id, sung_at, times_sung)
SELECT 
    q.room_id,
    q.user_id,
    v.song_id,
    COALESCE(q.completed_at, q.started_at, q.added_at) as sung_at,
    1 as times_sung
FROM kara_queue q
INNER JOIN kara_versions v ON q.version_id = v.id
WHERE q.status = 'completed'
    AND q.version_id IS NOT NULL
    AND v.song_id IS NOT NULL
    AND q.completed_at IS NOT NULL
    -- Only insert if history entry doesn't already exist
    AND NOT EXISTS (
        SELECT 1 
        FROM kara_song_history h 
        WHERE h.room_id = q.room_id 
            AND h.user_id = q.user_id 
            AND h.song_id = v.song_id
            AND h.sung_at = COALESCE(q.completed_at, q.started_at, q.added_at)
    )
ON CONFLICT DO NOTHING;

-- Step 3: For songs that appear multiple times, update times_sung
-- This handles cases where the same user sang the same song multiple times
UPDATE kara_song_history h
SET times_sung = (
    SELECT COUNT(*)
    FROM kara_queue q
    LEFT JOIN kara_versions v ON q.version_id = v.id
    WHERE q.status = 'completed'
        AND q.room_id = h.room_id
        AND q.user_id = h.user_id
        AND (
            (q.song_id IS NOT NULL AND q.song_id = h.song_id)
            OR (q.version_id IS NOT NULL AND v.song_id = h.song_id)
        )
)
WHERE EXISTS (
    SELECT 1
    FROM kara_queue q
    LEFT JOIN kara_versions v ON q.version_id = v.id
    WHERE q.status = 'completed'
        AND q.room_id = h.room_id
        AND q.user_id = h.user_id
        AND (
            (q.song_id IS NOT NULL AND q.song_id = h.song_id)
            OR (q.version_id IS NOT NULL AND v.song_id = h.song_id)
        )
);

-- Verification: Check how many entries were created
SELECT 
    COUNT(*) as backfilled_entries,
    COUNT(DISTINCT user_id) as unique_users,
    COUNT(DISTINCT room_id) as unique_rooms
FROM kara_song_history;
