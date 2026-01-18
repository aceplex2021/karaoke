-- ============================================
-- FIX DUPLICATE SONGS
-- ============================================
-- This script merges duplicate song records by:
-- 1. Identifying duplicates (same title + artist_id)
-- 2. Keeping the song with most versions (or oldest if tied)
-- 3. Reassigning all references to the "keep" song
-- 4. Deleting duplicate song records
-- ============================================

-- ============================================
-- STEP 1: PRE-FLIGHT CHECKS
-- ============================================

-- Check 1: How many duplicates exist?
SELECT 
  'PRE-FLIGHT CHECK' as check_type,
  'Duplicate sets found' as metric,
  COUNT(*) as count
FROM (
  SELECT title, COALESCE(artist_id::text, 'NULL') as artist, COUNT(*) as dup_count
  FROM kara_songs
  GROUP BY title, artist_id
  HAVING COUNT(*) > 1
) dups

UNION ALL

SELECT 
  'PRE-FLIGHT CHECK',
  'Total duplicate records to delete',
  SUM(dup_count) - COUNT(*)
FROM (
  SELECT title, COALESCE(artist_id::text, 'NULL') as artist, COUNT(*) as dup_count
  FROM kara_songs
  GROUP BY title, artist_id
  HAVING COUNT(*) > 1
) dups

UNION ALL

SELECT 
  'PRE-FLIGHT CHECK',
  'Total songs affected',
  SUM(dup_count)
FROM (
  SELECT title, COALESCE(artist_id::text, 'NULL') as artist, COUNT(*) as dup_count
  FROM kara_songs
  GROUP BY title, artist_id
  HAVING COUNT(*) > 1
) dups

UNION ALL

-- Check 2: Pre-existing orphaned queue entries
SELECT 
  'PRE-FLIGHT CHECK',
  'Pre-existing orphaned queue entries',
  COUNT(*)
FROM kara_queue q
WHERE NOT EXISTS (SELECT 1 FROM kara_songs s WHERE s.id = q.song_id);

-- ============================================
-- STEP 2: CREATE BACKUP TABLES
-- ============================================

-- Backup kara_songs
DROP TABLE IF EXISTS kara_songs_backup_20260117_dedup;
CREATE TABLE kara_songs_backup_20260117_dedup AS 
SELECT * FROM kara_songs;

-- Backup all affected tables
DROP TABLE IF EXISTS kara_versions_backup_20260117_dedup;
CREATE TABLE kara_versions_backup_20260117_dedup AS 
SELECT * FROM kara_versions;

DROP TABLE IF EXISTS kara_queue_backup_20260117_dedup;
CREATE TABLE kara_queue_backup_20260117_dedup AS 
SELECT * FROM kara_queue;

DROP TABLE IF EXISTS kara_song_history_backup_20260117_dedup;
CREATE TABLE kara_song_history_backup_20260117_dedup AS 
SELECT * FROM kara_song_history;

DROP TABLE IF EXISTS kara_user_preferences_backup_20260117_dedup;
CREATE TABLE kara_user_preferences_backup_20260117_dedup AS 
SELECT * FROM kara_user_preferences;

DROP TABLE IF EXISTS kara_song_group_members_backup_20260117_dedup;
CREATE TABLE kara_song_group_members_backup_20260117_dedup AS 
SELECT * FROM kara_song_group_members;

-- ============================================
-- STEP 3: CREATE TEMP TABLE WITH MERGE PLAN
-- ============================================

CREATE TEMP TABLE duplicate_merge_plan AS
SELECT 
  title,
  artist_id,
  (ARRAY_AGG(id ORDER BY 
    (SELECT COUNT(*) FROM kara_versions v WHERE v.song_id = kara_songs.id) DESC,
    created_at ASC
  ))[1] as keep_song_id,
  ARRAY_REMOVE(ARRAY_AGG(id ORDER BY 
    (SELECT COUNT(*) FROM kara_versions v WHERE v.song_id = kara_songs.id) DESC,
    created_at ASC
  ), (ARRAY_AGG(id ORDER BY 
    (SELECT COUNT(*) FROM kara_versions v WHERE v.song_id = kara_songs.id) DESC,
    created_at ASC
  ))[1]) as delete_song_ids,
  COUNT(*) as duplicate_count
FROM kara_songs
GROUP BY title, artist_id
HAVING COUNT(*) > 1;

-- Show the merge plan
SELECT 
  'MERGE PLAN' as section,
  title,
  artist_id,
  keep_song_id,
  array_length(delete_song_ids, 1) as deleting_count,
  duplicate_count
FROM duplicate_merge_plan
ORDER BY duplicate_count DESC, title
LIMIT 20;

-- ============================================
-- STEP 4: BEGIN TRANSACTION
-- ============================================

BEGIN;

-- ============================================
-- STEP 4A: CLEAN UP PRE-EXISTING ORPHANS
-- ============================================

-- Delete queue entries that reference non-existent songs
DO $$
DECLARE
  orphaned_deleted integer;
BEGIN
  DELETE FROM kara_queue q
  WHERE NOT EXISTS (SELECT 1 FROM kara_songs s WHERE s.id = q.song_id);
  
  GET DIAGNOSTICS orphaned_deleted = ROW_COUNT;
  
  IF orphaned_deleted > 0 THEN
    RAISE NOTICE 'Deleted % pre-existing orphaned queue entries', orphaned_deleted;
  END IF;
END $$;

-- ============================================
-- STEP 5: REASSIGN ALL REFERENCES
-- ============================================

-- 5.1: Update kara_queue FIRST (before deleting any versions)
DO $$
DECLARE
  plan_record RECORD;
  delete_id uuid;
  queue_record RECORD;
  keep_version_id uuid;
  queue_updated integer := 0;
BEGIN
  FOR plan_record IN SELECT * FROM duplicate_merge_plan LOOP
    FOREACH delete_id IN ARRAY plan_record.delete_song_ids LOOP
      -- For each queue entry referencing a delete song
      FOR queue_record IN 
        SELECT * FROM kara_queue WHERE song_id = delete_id
      LOOP
        -- Find equivalent version in keep_song (same label)
        SELECT id INTO keep_version_id
        FROM kara_versions
        WHERE song_id = plan_record.keep_song_id
        AND label = (
          SELECT label FROM kara_versions WHERE id = queue_record.version_id
        )
        LIMIT 1;
        
        -- If found, update to use keep song's version
        IF keep_version_id IS NOT NULL THEN
          UPDATE kara_queue
          SET song_id = plan_record.keep_song_id,
              version_id = keep_version_id
          WHERE id = queue_record.id;
          queue_updated := queue_updated + 1;
        ELSE
          -- No equivalent version, just update song_id and keep version_id
          -- (version will be migrated to keep_song in next step)
          UPDATE kara_queue
          SET song_id = plan_record.keep_song_id
          WHERE id = queue_record.id;
          queue_updated := queue_updated + 1;
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;
  RAISE NOTICE 'Updated % queue entries', queue_updated;
END $$;

-- 5.2: Update kara_versions (handle duplicate labels)
DO $$
DECLARE
  plan_record RECORD;
  delete_id uuid;
  version_record RECORD;
  versions_updated integer := 0;
  versions_deleted integer := 0;
  new_label text;
  label_suffix integer;
BEGIN
  FOR plan_record IN SELECT * FROM duplicate_merge_plan LOOP
    FOREACH delete_id IN ARRAY plan_record.delete_song_ids LOOP
      -- For each version from the delete song
      FOR version_record IN 
        SELECT * FROM kara_versions WHERE song_id = delete_id
      LOOP
        -- Check if keep_song already has a version with this label
        IF EXISTS (
          SELECT 1 FROM kara_versions 
          WHERE song_id = plan_record.keep_song_id 
          AND label = version_record.label
        ) THEN
          -- Duplicate label detected
          -- Check if they're identical (same files)
          IF EXISTS (
            SELECT 1 
            FROM kara_files f1
            JOIN kara_files f2 ON f1.storage_path = f2.storage_path
            WHERE f1.version_id = version_record.id
            AND f2.version_id = (
              SELECT id FROM kara_versions 
              WHERE song_id = plan_record.keep_song_id 
              AND label = version_record.label
              LIMIT 1
            )
          ) THEN
            -- They're the same version, but check if still in use by queue
            IF NOT EXISTS (
              SELECT 1 FROM kara_queue WHERE version_id = version_record.id
            ) THEN
              -- Safe to delete
              DELETE FROM kara_versions WHERE id = version_record.id;
              versions_deleted := versions_deleted + 1;
              RAISE NOTICE 'Deleted duplicate version % (label: %) for song %', 
                version_record.id, version_record.label, delete_id;
            ELSE
              -- Still in queue, rename instead of delete
              label_suffix := 2;
              new_label := version_record.label || '_dup' || label_suffix;
              
              WHILE EXISTS (
                SELECT 1 FROM kara_versions 
                WHERE song_id = plan_record.keep_song_id 
                AND label = new_label
              ) LOOP
                label_suffix := label_suffix + 1;
                new_label := version_record.label || '_dup' || label_suffix;
              END LOOP;
              
              UPDATE kara_versions
              SET song_id = plan_record.keep_song_id, label = new_label
              WHERE id = version_record.id;
              versions_updated := versions_updated + 1;
              RAISE NOTICE 'Renamed queued version % from % to % (in use)', 
                version_record.id, version_record.label, new_label;
            END IF;
          ELSE
            -- Different versions, rename with suffix
            label_suffix := 2;
            new_label := version_record.label || '_v' || label_suffix;
            
            -- Find unique label
            WHILE EXISTS (
              SELECT 1 FROM kara_versions 
              WHERE song_id = plan_record.keep_song_id 
              AND label = new_label
            ) LOOP
              label_suffix := label_suffix + 1;
              new_label := version_record.label || '_v' || label_suffix;
            END LOOP;
            
            -- Update with new unique label
            UPDATE kara_versions
            SET song_id = plan_record.keep_song_id, label = new_label
            WHERE id = version_record.id;
            versions_updated := versions_updated + 1;
            RAISE NOTICE 'Renamed version % from % to % for song %', 
              version_record.id, version_record.label, new_label, delete_id;
          END IF;
        ELSE
          -- No conflict, just update song_id
          UPDATE kara_versions
          SET song_id = plan_record.keep_song_id
          WHERE id = version_record.id;
          versions_updated := versions_updated + 1;
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;
  
  RAISE NOTICE 'Total versions updated: %', versions_updated;
  RAISE NOTICE 'Total duplicate versions deleted: %', versions_deleted;
END $$;

-- 5.3: Update kara_song_history
DO $$
DECLARE
  plan_record RECORD;
  delete_id uuid;
  history_updated integer := 0;
BEGIN
  FOR plan_record IN SELECT * FROM duplicate_merge_plan LOOP
    FOREACH delete_id IN ARRAY plan_record.delete_song_ids LOOP
      UPDATE kara_song_history
      SET song_id = plan_record.keep_song_id
      WHERE song_id = delete_id;
      
      GET DIAGNOSTICS history_updated = ROW_COUNT;
      IF history_updated > 0 THEN
        RAISE NOTICE 'Updated % history entries from song % to %', 
          history_updated, delete_id, plan_record.keep_song_id;
      END IF;
    END LOOP;
  END LOOP;
END $$;

-- 5.4: Update kara_user_preferences (favorite_song_ids JSONB array)
DO $$
DECLARE
  plan_record RECORD;
  delete_id uuid;
  pref_record RECORD;
  new_favorites jsonb;
  preferences_updated integer := 0;
BEGIN
  FOR plan_record IN SELECT * FROM duplicate_merge_plan LOOP
    FOREACH delete_id IN ARRAY plan_record.delete_song_ids LOOP
      -- Find all user preferences that contain this delete_id in favorites
      FOR pref_record IN 
        SELECT id, favorite_song_ids 
        FROM kara_user_preferences
        WHERE favorite_song_ids::text LIKE '%' || delete_id || '%'
      LOOP
        -- Replace delete_id with keep_song_id in the JSONB array
        SELECT jsonb_agg(
          CASE 
            WHEN elem::text = ('"' || delete_id || '"') THEN to_jsonb(plan_record.keep_song_id::text)
            ELSE elem
          END
        )
        INTO new_favorites
        FROM jsonb_array_elements(pref_record.favorite_song_ids) elem;
        
        -- Remove duplicates (in case keep_song_id was already in favorites)
        SELECT jsonb_agg(DISTINCT elem ORDER BY elem)
        INTO new_favorites
        FROM jsonb_array_elements(new_favorites) elem;
        
        UPDATE kara_user_preferences
        SET favorite_song_ids = COALESCE(new_favorites, '[]'::jsonb)
        WHERE id = pref_record.id;
        
        preferences_updated := preferences_updated + 1;
      END LOOP;
      
      IF preferences_updated > 0 THEN
        RAISE NOTICE 'Updated % user preferences for song % to %', 
          preferences_updated, delete_id, plan_record.keep_song_id;
      END IF;
    END LOOP;
  END LOOP;
END $$;

-- 5.5: Update kara_song_group_members (remove duplicates within same group)
DO $$
DECLARE
  plan_record RECORD;
  delete_id uuid;
  members_deleted integer := 0;
BEGIN
  FOR plan_record IN SELECT * FROM duplicate_merge_plan LOOP
    -- For each duplicate set, keep only one entry per group
    -- Delete entries for delete_song_ids where keep_song_id already exists in same group
    FOREACH delete_id IN ARRAY plan_record.delete_song_ids LOOP
      DELETE FROM kara_song_group_members m1
      WHERE m1.song_id = delete_id
      AND EXISTS (
        SELECT 1 FROM kara_song_group_members m2
        WHERE m2.song_id = plan_record.keep_song_id
        AND m2.group_id = m1.group_id
      );
      
      GET DIAGNOSTICS members_deleted = ROW_COUNT;
      IF members_deleted > 0 THEN
        RAISE NOTICE 'Deleted % duplicate group memberships for song %', 
          members_deleted, delete_id;
      END IF;
      
      -- Update remaining entries (if song was in different groups)
      UPDATE kara_song_group_members
      SET song_id = plan_record.keep_song_id
      WHERE song_id = delete_id;
    END LOOP;
  END LOOP;
END $$;

-- ============================================
-- STEP 6: DELETE DUPLICATE SONGS
-- ============================================

DO $$
DECLARE
  plan_record RECORD;
  delete_id uuid;
  songs_deleted integer := 0;
  total_deleted integer := 0;
BEGIN
  FOR plan_record IN SELECT * FROM duplicate_merge_plan LOOP
    FOREACH delete_id IN ARRAY plan_record.delete_song_ids LOOP
      DELETE FROM kara_songs WHERE id = delete_id;
      GET DIAGNOSTICS songs_deleted = ROW_COUNT;
      total_deleted := total_deleted + songs_deleted;
    END LOOP;
  END LOOP;
  
  RAISE NOTICE '============================================';
  RAISE NOTICE 'DELETED % DUPLICATE SONG RECORDS', total_deleted;
  RAISE NOTICE '============================================';
END $$;

-- ============================================
-- STEP 7: VALIDATION
-- ============================================

-- Validation 1: Remaining duplicates (should be 0)
DO $$
DECLARE
  remaining_dups integer;
BEGIN
  SELECT COUNT(*) INTO remaining_dups
  FROM (
    SELECT title, artist_id, COUNT(*) as dup_count
    FROM kara_songs
    GROUP BY title, artist_id
    HAVING COUNT(*) > 1
  ) dups;
  
  RAISE NOTICE 'Validation 1: Remaining duplicate sets = %', remaining_dups;
  
  IF remaining_dups > 0 THEN
    RAISE EXCEPTION 'VALIDATION FAILED: Still have % duplicate sets!', remaining_dups;
  END IF;
END $$;

-- Validation 2: All versions still have valid song_id
DO $$
DECLARE
  orphaned_versions integer;
BEGIN
  SELECT COUNT(*) INTO orphaned_versions
  FROM kara_versions v
  WHERE NOT EXISTS (SELECT 1 FROM kara_songs s WHERE s.id = v.song_id);
  
  RAISE NOTICE 'Validation 2: Orphaned versions = %', orphaned_versions;
  
  IF orphaned_versions > 0 THEN
    RAISE EXCEPTION 'VALIDATION FAILED: % versions have invalid song_id!', orphaned_versions;
  END IF;
END $$;

-- Validation 3: All queue entries have valid song_id
DO $$
DECLARE
  orphaned_queue integer;
BEGIN
  SELECT COUNT(*) INTO orphaned_queue
  FROM kara_queue q
  WHERE NOT EXISTS (SELECT 1 FROM kara_songs s WHERE s.id = q.song_id);
  
  RAISE NOTICE 'Validation 3: Orphaned queue entries = %', orphaned_queue;
  
  IF orphaned_queue > 0 THEN
    RAISE EXCEPTION 'VALIDATION FAILED: % queue entries have invalid song_id!', orphaned_queue;
  END IF;
END $$;

-- Validation 4: All history entries have valid song_id
DO $$
DECLARE
  orphaned_history integer;
BEGIN
  SELECT COUNT(*) INTO orphaned_history
  FROM kara_song_history h
  WHERE NOT EXISTS (SELECT 1 FROM kara_songs s WHERE s.id = h.song_id);
  
  RAISE NOTICE 'Validation 4: Orphaned history entries = %', orphaned_history;
  
  IF orphaned_history > 0 THEN
    RAISE EXCEPTION 'VALIDATION FAILED: % history entries have invalid song_id!', orphaned_history;
  END IF;
END $$;

-- Validation 5: All group members have valid song_id
DO $$
DECLARE
  orphaned_members integer;
BEGIN
  SELECT COUNT(*) INTO orphaned_members
  FROM kara_song_group_members m
  WHERE NOT EXISTS (SELECT 1 FROM kara_songs s WHERE s.id = m.song_id);
  
  RAISE NOTICE 'Validation 5: Orphaned group members = %', orphaned_members;
  
  IF orphaned_members > 0 THEN
    RAISE EXCEPTION 'VALIDATION FAILED: % group members have invalid song_id!', orphaned_members;
  END IF;
END $$;

-- Validation 6: Record counts
DO $$BEGIN
  RAISE NOTICE '============================================';
  RAISE NOTICE 'FINAL COUNTS:';
  RAISE NOTICE 'Total songs: %', (SELECT COUNT(*) FROM kara_songs);
  RAISE NOTICE 'Total versions: %', (SELECT COUNT(*) FROM kara_versions);
  RAISE NOTICE 'Total queue entries: %', (SELECT COUNT(*) FROM kara_queue);
  RAISE NOTICE 'Total history entries: %', (SELECT COUNT(*) FROM kara_song_history);
  RAISE NOTICE 'Total group members: %', (SELECT COUNT(*) FROM kara_song_group_members);
  RAISE NOTICE '============================================';
END $$;

-- ============================================
-- STEP 8: COMMIT OR ROLLBACK
-- ============================================
-- Review the output above. If everything looks good:
--   COMMIT;
-- If something went wrong:
--   ROLLBACK;

-- Uncomment one of these after review:
-- COMMIT;
-- ROLLBACK;
