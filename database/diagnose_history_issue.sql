-- Diagnostic script to check why history isn't showing
-- Run this to see what's happening with history

-- 1. Check if advance_playback function exists and has history writing code
SELECT 
    proname as function_name,
    pg_get_functiondef(oid) LIKE '%kara_song_history%' as has_history_code
FROM pg_proc 
WHERE proname = 'advance_playback';

-- 2. Check completed songs in queue (should have history entries)
SELECT 
    q.id,
    q.room_id,
    q.user_id,
    q.song_id,
    q.version_id,
    q.status,
    q.completed_at,
    CASE 
        WHEN q.song_id IS NOT NULL THEN 'Has song_id'
        WHEN q.version_id IS NOT NULL THEN 'Has version_id (need to get song_id from version)'
        ELSE 'MISSING BOTH song_id and version_id!'
    END as data_status
FROM kara_queue q
WHERE q.status = 'completed'
ORDER BY q.completed_at DESC
LIMIT 20;

-- 3. Check if completed songs have corresponding versions with song_id
SELECT 
    q.id as queue_id,
    q.user_id,
    q.version_id,
    v.song_id as version_song_id,
    q.song_id as queue_song_id,
    COALESCE(q.song_id, v.song_id) as effective_song_id
FROM kara_queue q
LEFT JOIN kara_versions v ON q.version_id = v.id
WHERE q.status = 'completed'
    AND q.completed_at IS NOT NULL
ORDER BY q.completed_at DESC
LIMIT 20;

-- 4. Check existing history entries
SELECT 
    COUNT(*) as total_history_entries,
    COUNT(DISTINCT user_id) as unique_users,
    COUNT(DISTINCT room_id) as unique_rooms,
    MIN(sung_at) as oldest_entry,
    MAX(sung_at) as newest_entry
FROM kara_song_history;

-- 5. Check recent history entries
SELECT 
    h.id,
    h.room_id,
    h.user_id,
    h.song_id,
    h.sung_at,
    h.times_sung,
    s.title as song_title
FROM kara_song_history h
LEFT JOIN kara_songs s ON h.song_id = s.id
ORDER BY h.sung_at DESC
LIMIT 10;

-- 6. Count completed songs vs history entries (should match if function is working)
SELECT 
    (SELECT COUNT(*) FROM kara_queue WHERE status = 'completed' AND completed_at IS NOT NULL) as completed_songs,
    (SELECT COUNT(*) FROM kara_song_history) as history_entries,
    (SELECT COUNT(*) FROM kara_queue WHERE status = 'completed' AND completed_at IS NOT NULL) - 
    (SELECT COUNT(*) FROM kara_song_history) as missing_history_entries;
