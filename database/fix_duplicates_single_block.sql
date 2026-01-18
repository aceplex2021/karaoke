-- ============================================
-- FIX DUPLICATE SONGS (SINGLE DO BLOCK)
-- ============================================
-- Runs everything in one server-side block
-- WITH MANUAL COMMIT REQUIRED
-- ============================================

BEGIN;

DO $$
DECLARE
  dup_record RECORD;
  delete_id uuid;
  keep_id uuid;
  queue_record RECORD;
  keep_version_id uuid;
  version_record RECORD;
  new_label text;
  label_suffix integer;
  
  orphaned_deleted integer := 0;
  total_queue_updated integer := 0;
  total_versions_updated integer := 0;
  total_versions_deleted integer := 0;
  total_history_updated integer := 0;
  total_prefs_updated integer := 0;
  total_members_deleted integer := 0;
  total_songs_deleted integer := 0;
  
  remaining_dups integer;
  orphaned_versions integer;
  orphaned_queue integer;
  orphaned_history integer;
  orphaned_members integer;
BEGIN
  RAISE NOTICE 'Starting deduplication...';
  
  -- Clean up pre-existing orphaned queue entries
  DELETE FROM kara_queue q
  WHERE NOT EXISTS (SELECT 1 FROM kara_songs s WHERE s.id = q.song_id);
  GET DIAGNOSTICS orphaned_deleted = ROW_COUNT;
  RAISE NOTICE 'Deleted % pre-existing orphaned queue entries', orphaned_deleted;
  
  -- Process each duplicate set
  FOR dup_record IN
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
      ))[1]) as delete_song_ids
    FROM kara_songs
    GROUP BY title, artist_id
    HAVING COUNT(*) > 1
  LOOP
    keep_id := dup_record.keep_song_id;
    
    FOREACH delete_id IN ARRAY dup_record.delete_song_ids LOOP
      -- Update queue entries
      FOR queue_record IN SELECT * FROM kara_queue WHERE song_id = delete_id LOOP
        SELECT id INTO keep_version_id
        FROM kara_versions
        WHERE song_id = keep_id
        AND label = (SELECT label FROM kara_versions WHERE id = queue_record.version_id)
        LIMIT 1;
        
        IF keep_version_id IS NOT NULL THEN
          UPDATE kara_queue
          SET song_id = keep_id, version_id = keep_version_id
          WHERE id = queue_record.id;
        ELSE
          UPDATE kara_queue SET song_id = keep_id WHERE id = queue_record.id;
        END IF;
        total_queue_updated := total_queue_updated + 1;
      END LOOP;
      
      -- Update versions
      FOR version_record IN SELECT * FROM kara_versions WHERE song_id = delete_id LOOP
        IF EXISTS (
          SELECT 1 FROM kara_versions 
          WHERE song_id = keep_id AND label = version_record.label
        ) THEN
          IF EXISTS (
            SELECT 1 FROM kara_files f1
            JOIN kara_files f2 ON f1.storage_path = f2.storage_path
            WHERE f1.version_id = version_record.id
            AND f2.version_id = (
              SELECT id FROM kara_versions 
              WHERE song_id = keep_id AND label = version_record.label LIMIT 1
            )
          ) THEN
            IF NOT EXISTS (SELECT 1 FROM kara_queue WHERE version_id = version_record.id) THEN
              DELETE FROM kara_versions WHERE id = version_record.id;
              total_versions_deleted := total_versions_deleted + 1;
            ELSE
              label_suffix := 2;
              new_label := version_record.label || '_dup' || label_suffix;
              WHILE EXISTS (
                SELECT 1 FROM kara_versions 
                WHERE song_id = keep_id AND label = new_label
              ) LOOP
                label_suffix := label_suffix + 1;
                new_label := version_record.label || '_dup' || label_suffix;
              END LOOP;
              UPDATE kara_versions
              SET song_id = keep_id, label = new_label
              WHERE id = version_record.id;
              total_versions_updated := total_versions_updated + 1;
            END IF;
          ELSE
            label_suffix := 2;
            new_label := version_record.label || '_v' || label_suffix;
            WHILE EXISTS (
              SELECT 1 FROM kara_versions 
              WHERE song_id = keep_id AND label = new_label
            ) LOOP
              label_suffix := label_suffix + 1;
              new_label := version_record.label || '_v' || label_suffix;
            END LOOP;
            UPDATE kara_versions
            SET song_id = keep_id, label = new_label
            WHERE id = version_record.id;
            total_versions_updated := total_versions_updated + 1;
          END IF;
        ELSE
          UPDATE kara_versions SET song_id = keep_id WHERE id = version_record.id;
          total_versions_updated := total_versions_updated + 1;
        END IF;
      END LOOP;
      
      -- Update history
      UPDATE kara_song_history SET song_id = keep_id WHERE song_id = delete_id;
      total_history_updated := total_history_updated + (SELECT COUNT(*) FROM kara_song_history WHERE song_id = keep_id AND song_id IN (SELECT id FROM kara_songs WHERE title = dup_record.title));
      
      -- Update preferences
      UPDATE kara_user_preferences
      SET favorite_song_ids = (
        SELECT jsonb_agg(DISTINCT 
          CASE WHEN elem::text = ('"' || delete_id || '"') 
          THEN to_jsonb(keep_id::text) 
          ELSE elem END
        )
        FROM jsonb_array_elements(favorite_song_ids) elem
      )
      WHERE favorite_song_ids::text LIKE '%' || delete_id || '%';
      
      -- Update group members
      DELETE FROM kara_song_group_members m1
      WHERE m1.song_id = delete_id
      AND EXISTS (
        SELECT 1 FROM kara_song_group_members m2
        WHERE m2.song_id = keep_id AND m2.group_id = m1.group_id
      );
      
      UPDATE kara_song_group_members SET song_id = keep_id WHERE song_id = delete_id;
      
      -- Delete the duplicate song
      DELETE FROM kara_songs WHERE id = delete_id;
      total_songs_deleted := total_songs_deleted + 1;
    END LOOP;
  END LOOP;
  
  RAISE NOTICE '============================================';
  RAISE NOTICE 'DEDUPLICATION COMPLETE';
  RAISE NOTICE 'Queue entries updated: %', total_queue_updated;
  RAISE NOTICE 'Versions updated: %', total_versions_updated;
  RAISE NOTICE 'Versions deleted: %', total_versions_deleted;
  RAISE NOTICE 'History entries updated: %', total_history_updated;
  RAISE NOTICE 'User preferences updated: %', total_prefs_updated;
  RAISE NOTICE 'Group memberships cleaned: %', total_members_deleted;
  RAISE NOTICE 'Duplicate songs deleted: %', total_songs_deleted;
  RAISE NOTICE '============================================';
  
  -- VALIDATIONS
  SELECT COUNT(*) INTO remaining_dups
  FROM (SELECT title, artist_id FROM kara_songs GROUP BY title, artist_id HAVING COUNT(*) > 1) dups;
  RAISE NOTICE 'Validation 1: Remaining duplicate sets = %', remaining_dups;
  IF remaining_dups > 0 THEN
    RAISE EXCEPTION 'VALIDATION FAILED: Still have % duplicate sets!', remaining_dups;
  END IF;
  
  SELECT COUNT(*) INTO orphaned_versions
  FROM kara_versions v WHERE NOT EXISTS (SELECT 1 FROM kara_songs s WHERE s.id = v.song_id);
  RAISE NOTICE 'Validation 2: Orphaned versions = %', orphaned_versions;
  IF orphaned_versions > 0 THEN
    RAISE EXCEPTION 'VALIDATION FAILED: % versions have invalid song_id!', orphaned_versions;
  END IF;
  
  SELECT COUNT(*) INTO orphaned_queue
  FROM kara_queue q WHERE NOT EXISTS (SELECT 1 FROM kara_songs s WHERE s.id = q.song_id);
  RAISE NOTICE 'Validation 3: Orphaned queue entries = %', orphaned_queue;
  IF orphaned_queue > 0 THEN
    RAISE EXCEPTION 'VALIDATION FAILED: % queue entries have invalid song_id!', orphaned_queue;
  END IF;
  
  SELECT COUNT(*) INTO orphaned_history
  FROM kara_song_history h WHERE NOT EXISTS (SELECT 1 FROM kara_songs s WHERE s.id = h.song_id);
  RAISE NOTICE 'Validation 4: Orphaned history entries = %', orphaned_history;
  IF orphaned_history > 0 THEN
    RAISE EXCEPTION 'VALIDATION FAILED: % history entries have invalid song_id!', orphaned_history;
  END IF;
  
  SELECT COUNT(*) INTO orphaned_members
  FROM kara_song_group_members m WHERE NOT EXISTS (SELECT 1 FROM kara_songs s WHERE s.id = m.song_id);
  RAISE NOTICE 'Validation 5: Orphaned group members = %', orphaned_members;
  IF orphaned_members > 0 THEN
    RAISE EXCEPTION 'VALIDATION FAILED: % group members have invalid song_id!', orphaned_members;
  END IF;
  
  RAISE NOTICE '============================================';
  RAISE NOTICE 'FINAL COUNTS:';
  RAISE NOTICE 'Total songs: %', (SELECT COUNT(*) FROM kara_songs);
  RAISE NOTICE 'Total versions: %', (SELECT COUNT(*) FROM kara_versions);
  RAISE NOTICE 'Total queue entries: %', (SELECT COUNT(*) FROM kara_queue);
  RAISE NOTICE 'Total history entries: %', (SELECT COUNT(*) FROM kara_song_history);
  RAISE NOTICE 'Total group members: %', (SELECT COUNT(*) FROM kara_song_group_members);
  RAISE NOTICE '============================================';
  RAISE NOTICE 'ALL VALIDATIONS PASSED!';
END $$;

-- ============================================
-- AUTO-COMMIT
-- ============================================
-- All validations passed, committing changes
COMMIT;
