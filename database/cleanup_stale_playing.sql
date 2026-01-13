-- Cleanup stale playing entries after server restart
-- This fixes orphaned "playing" entries when the server is restarted

-- Mark all stale playing entries as completed (older than 2 hours)
UPDATE kara_queue 
SET 
    status = 'completed', 
    completed_at = NOW()
WHERE status = 'playing'
AND started_at < NOW() - INTERVAL '2 hours';

-- For the specific stuck entry from this session (if still exists)
UPDATE kara_queue 
SET 
    status = 'completed', 
    completed_at = NOW()
WHERE id = '481e2fc8-7e0d-4572-9801-2f194f3bd9fc'
AND status = 'playing';

-- Clear room pointers for any rooms with stale entries
UPDATE kara_rooms 
SET 
    current_entry_id = NULL
WHERE current_entry_id IN (
    SELECT id FROM kara_queue WHERE status != 'playing'
);

-- Specifically clear the stuck room
UPDATE kara_rooms 
SET 
    current_entry_id = NULL,
    last_singer_id = NULL
WHERE id = '4f04b7e4-ebba-4590-9c35-bbdf2e67ce3f';

-- Show results
SELECT 'Cleanup complete' as message;
SELECT COUNT(*) as stale_entries_fixed 
FROM kara_queue 
WHERE status = 'completed' 
AND completed_at > NOW() - INTERVAL '1 minute';
