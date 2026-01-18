# Troubleshooting: History and Search Tabs Empty

## Quick Diagnosis Steps

### Step 1: Check if SQL function was applied

Run this in your database:

```sql
-- Check if function exists and has history code
SELECT 
    proname as function_name,
    pg_get_functiondef(oid) LIKE '%kara_song_history%' as has_history_code
FROM pg_proc 
WHERE proname = 'advance_playback';
```

**Expected:** `has_history_code` should be `true`

**If false:** The function hasn't been updated. Run:
```sql
\i database/create_advance_playback_function.sql
```

### Step 2: Check for completed songs

```sql
-- Count completed songs
SELECT 
    COUNT(*) as completed_songs,
    COUNT(DISTINCT user_id) as unique_users
FROM kara_queue
WHERE status = 'completed' AND completed_at IS NOT NULL;
```

**Expected:** Should show completed songs if any have finished

### Step 3: Check if completed songs have data

```sql
-- Check if completed songs have song_id or version_id
SELECT 
    COUNT(*) as total_completed,
    COUNT(song_id) as with_song_id,
    COUNT(version_id) as with_version_id,
    COUNT(CASE WHEN song_id IS NULL AND version_id IS NULL THEN 1 END) as missing_both
FROM kara_queue
WHERE status = 'completed' AND completed_at IS NOT NULL;
```

**Expected:** Should have either `song_id` or `version_id` for all completed songs

### Step 4: Check history entries

```sql
-- Count history entries
SELECT COUNT(*) as history_count FROM kara_song_history;
```

**Expected:** Should match or be close to number of completed songs

### Step 5: Check browser console

Open browser DevTools (F12) and check Console tab for:
- `[users/history/recent]` logs
- `[users/history]` logs
- Any error messages

## Common Issues and Fixes

### Issue 1: Function not applied

**Symptom:** `has_history_code = false` in Step 1

**Fix:**
```sql
-- Apply the updated function
\i database/create_advance_playback_function.sql
```

### Issue 2: No completed songs yet

**Symptom:** Step 2 shows 0 completed songs

**Fix:** 
- Play some songs and let them finish (autoplay)
- History is only written when songs complete, not when added to queue

### Issue 3: Completed songs missing song_id/version_id

**Symptom:** Step 3 shows `missing_both > 0`

**Fix:** This shouldn't happen if songs were added correctly. Check:
- Are songs being added via `/api/queue/add`?
- Does that endpoint set `version_id`?

### Issue 4: History entries exist but not showing

**Symptom:** Step 4 shows history entries, but tabs are empty

**Possible causes:**
1. **Wrong user_id** - Check if history entries match the logged-in user
2. **Date filter too strict** - History tab filters to last 12 months
3. **API error** - Check browser console for errors

**Debug:**
```sql
-- Check recent history entries
SELECT 
    h.id,
    h.user_id,
    h.sung_at,
    s.title
FROM kara_song_history h
LEFT JOIN kara_songs s ON h.song_id = s.id
ORDER BY h.sung_at DESC
LIMIT 10;
```

### Issue 5: Backfill needed

**Symptom:** Completed songs exist but no history entries

**Fix:** Run the backfill script:
```sql
\i database/backfill_history_from_completed_songs.sql
```

This will create history entries for songs that completed before the fix was applied.

## Full Diagnostic Script

Run the complete diagnostic:

```sql
\i database/diagnose_history_issue.sql
```

This will show:
1. Function status
2. Completed songs status
3. Data availability
4. History entries
5. Comparison counts

## Testing After Fix

1. **Play a song** - Add to queue and let it play
2. **Wait for completion** - Let autoplay finish the song
3. **Check History Tab** - Should show the song
4. **Check Search Tab** - Should show in "Recent Songs" section
5. **Verify database:**
   ```sql
   SELECT * FROM kara_song_history ORDER BY sung_at DESC LIMIT 5;
   ```

## Still Not Working?

1. Check server logs for errors
2. Check browser console for API errors
3. Verify user_id matches between:
   - Logged-in user
   - Queue items
   - History entries
4. Check network tab in DevTools - are API calls returning data?
