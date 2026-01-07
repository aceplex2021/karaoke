-- Repair: Fix stale "playing" entries
-- Run this if UI shows "playing" but nothing is actually playing

-- ============================================
-- 1. Diagnose the problem
-- ============================================

-- Show all rooms with playing entries
SELECT 
    r.id as room_id,
    r.room_code,
    r.current_entry_id,
    q.id as queue_entry_id,
    q.status as queue_status,
    q.started_at,
    s.title as song_title
FROM kara_rooms r
LEFT JOIN kara_queue q ON q.id = r.current_entry_id
LEFT JOIN kara_songs s ON s.id = q.song_id
WHERE r.current_entry_id IS NOT NULL
ORDER BY r.room_code;

-- Show all queue entries with status='playing'
SELECT 
    q.id,
    q.room_id,
    r.room_code,
    q.status,
    q.started_at,
    s.title as song_title,
    CASE 
        WHEN r.current_entry_id = q.id THEN 'matches room.current_entry_id'
        ELSE 'orphaned (room.current_entry_id points elsewhere)'
    END as status_note
FROM kara_queue q
JOIN kara_rooms r ON r.id = q.room_id
LEFT JOIN kara_songs s ON s.id = q.song_id
WHERE q.status = 'playing'
ORDER BY r.room_code, q.started_at DESC;

-- ============================================
-- 2. Repair: Clear stale playing entries
-- ============================================

-- Option A: Clear all playing entries (nuclear option)
-- Uncomment if you want to reset everything:
-- UPDATE kara_queue SET status = 'completed', completed_at = NOW() WHERE status = 'playing';
-- UPDATE kara_rooms SET current_entry_id = NULL WHERE current_entry_id IS NOT NULL;

-- Option B: Smart repair - only fix entries that are stale (started more than 1 hour ago)
-- This assumes if a song has been "playing" for over an hour, it's stale
UPDATE kara_queue
SET 
    status = 'completed',
    completed_at = NOW()
WHERE status = 'playing'
AND (
    started_at IS NULL 
    OR started_at < NOW() - INTERVAL '1 hour'
);

-- Clear room.current_entry_id if it points to a non-playing entry
UPDATE kara_rooms
SET current_entry_id = NULL
WHERE current_entry_id IS NOT NULL
AND NOT EXISTS (
    SELECT 1 FROM kara_queue
    WHERE kara_queue.id = kara_rooms.current_entry_id
    AND kara_queue.status = 'playing'
);

-- ============================================
-- 3. Verify repair
-- ============================================

-- Should return 0 rows (no playing entries)
SELECT COUNT(*) as remaining_playing_entries
FROM kara_queue
WHERE status = 'playing';

-- Should return rooms with NULL current_entry_id (idle rooms)
SELECT 
    r.room_code,
    r.current_entry_id,
    COUNT(q.id) FILTER (WHERE q.status = 'pending') as pending_count
FROM kara_rooms r
LEFT JOIN kara_queue q ON q.room_id = r.id
GROUP BY r.room_code, r.current_entry_id
ORDER BY r.room_code;

