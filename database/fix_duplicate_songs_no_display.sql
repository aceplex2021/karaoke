-- ============================================
-- FIX DUPLICATE SONGS (NO DISPLAY VERSION)
-- ============================================
-- Runs the entire deduplication in one go
-- ============================================

-- Create merge plan
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

-- Start transaction
BEGIN;

-- Clean up pre-existing orphans
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

-- Update kara_queue FIRST
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
      FOR queue_record IN 
        SELECT * FROM kara_queue WHERE song_id = delete_id
      LOOP
        SELECT id INTO keep_version_id
        FROM kara_versions
        WHERE song_id = plan_record.keep_song_id
        AND label = (SELECT label FROM kara_versions WHERE id = queue_record.version_id)
        LIMIT 1;
        
        IF keep_version_id IS NOT NULL THEN
          UPDATE kara_queue
          SET song_id = plan_record.keep_song_id, version_id = keep_version_id
          WHERE id = queue_record.id;
          queue_updated := queue_updated + 1;
        ELSE
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

-- Update kara_versions
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
      FOR version_record IN 
        SELECT * FROM kara_versions WHERE song_id = delete_id
      LOOP
        IF EXISTS (
          SELECT 1 FROM kara_versions 
          WHERE song_id = plan_record.keep_song_id 
          AND label = version_record.label
        ) THEN
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
            IF NOT EXISTS (SELECT 1 FROM kara_queue WHERE version_id = version_record.id) THEN
              DELETE FROM kara_versions WHERE id = version_record.id;
              versions_deleted := versions_deleted + 1;
            ELSE
              label_suffix := 2;
              new_label := version_record.label || '_dup' || label_suffix;
              WHILE EXISTS (
                SELECT 1 FROM kara_versions 
                WHERE song_id = plan_record.keep_song_id AND label = new_label
              ) LOOP
                label_suffix := label_suffix + 1;
                new_label := version_record.label || '_dup' || label_suffix;
              END LOOP;
              UPDATE kara_versions
              SET song_id = plan_record.keep_song_id, label = new_label
              WHERE id = version_record.id;
              versions_updated := versions_updated + 1;
            END IF;
          ELSE
            label_suffix := 2;
            new_label := version_record.label || '_v' || label_suffix;
            WHILE EXISTS (
              SELECT 1 FROM kara_versions 
              WHERE song_id = plan_record.keep_song_id AND label = new_label
            ) LOOP
              label_suffix := label_suffix + 1;
              new_label := version_record.label || '_v' || label_suffix;
            END LOOP;
            UPDATE kara_versions
            SET song_id = plan_record.keep_song_id, label = new_label
            WHERE id = version_record.id;
            versions_updated := versions_updated + 1;
          END IF;
        ELSE
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

-- Update kara_song_history
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
    END LOOP;
  END LOOP;
  RAISE NOTICE 'Updated history entries: %', history_updated;
END $$;

-- Update kara_user_preferences
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
      FOR pref_record IN 
        SELECT id, favorite_song_ids 
        FROM kara_user_preferences
        WHERE favorite_song_ids::text LIKE '%' || delete_id || '%'
      LOOP
        SELECT jsonb_agg(
          CASE 
            WHEN elem::text = ('"' || delete_id || '"') THEN to_jsonb(plan_record.keep_song_id::text)
            ELSE elem
          END
        )
        INTO new_favorites
        FROM jsonb_array_elements(pref_record.favorite_song_ids) elem;
        
        SELECT jsonb_agg(DISTINCT elem ORDER BY elem)
        INTO new_favorites
        FROM jsonb_array_elements(new_favorites) elem;
        
        UPDATE kara_user_preferences
        SET favorite_song_ids = COALESCE(new_favorites, '[]'::jsonb)
        WHERE id = pref_record.id;
        preferences_updated := preferences_updated + 1;
      END LOOP;
    END LOOP;
  END LOOP;
  IF preferences_updated > 0 THEN
    RAISE NOTICE 'Updated % user preferences', preferences_updated;
  END IF;
END $$;

-- Update kara_song_group_members
DO $$
DECLARE
  plan_record RECORD;
  delete_id uuid;
  members_deleted integer := 0;
BEGIN
  FOR plan_record IN SELECT * FROM duplicate_merge_plan LOOP
    FOREACH delete_id IN ARRAY plan_record.delete_song_ids LOOP
      DELETE FROM kara_song_group_members m1
      WHERE m1.song_id = delete_id
      AND EXISTS (
        SELECT 1 FROM kara_song_group_members m2
        WHERE m2.song_id = plan_record.keep_song_id AND m2.group_id = m1.group_id
      );
      GET DIAGNOSTICS members_deleted = ROW_COUNT;
      
      UPDATE kara_song_group_members
      SET song_id = plan_record.keep_song_id
      WHERE song_id = delete_id;
    END LOOP;
  END LOOP;
  RAISE NOTICE 'Cleaned up % duplicate group memberships', members_deleted;
END $$;

-- Delete duplicate songs
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

-- VALIDATIONS
DO $$
DECLARE
  remaining_dups integer;
  orphaned_versions integer;
  orphaned_queue integer;
  orphaned_history integer;
  orphaned_members integer;
BEGIN
  -- Validation 1
  SELECT COUNT(*) INTO remaining_dups
  FROM (SELECT title, artist_id FROM kara_songs GROUP BY title, artist_id HAVING COUNT(*) > 1) dups;
  RAISE NOTICE 'Validation 1: Remaining duplicate sets = %', remaining_dups;
  IF remaining_dups > 0 THEN
    RAISE EXCEPTION 'VALIDATION FAILED: Still have % duplicate sets!', remaining_dups;
  END IF;

  -- Validation 2
  SELECT COUNT(*) INTO orphaned_versions
  FROM kara_versions v WHERE NOT EXISTS (SELECT 1 FROM kara_songs s WHERE s.id = v.song_id);
  RAISE NOTICE 'Validation 2: Orphaned versions = %', orphaned_versions;
  IF orphaned_versions > 0 THEN
    RAISE EXCEPTION 'VALIDATION FAILED: % versions have invalid song_id!', orphaned_versions;
  END IF;

  -- Validation 3
  SELECT COUNT(*) INTO orphaned_queue
  FROM kara_queue q WHERE NOT EXISTS (SELECT 1 FROM kara_songs s WHERE s.id = q.song_id);
  RAISE NOTICE 'Validation 3: Orphaned queue entries = %', orphaned_queue;
  IF orphaned_queue > 0 THEN
    RAISE EXCEPTION 'VALIDATION FAILED: % queue entries have invalid song_id!', orphaned_queue;
  END IF;

  -- Validation 4
  SELECT COUNT(*) INTO orphaned_history
  FROM kara_song_history h WHERE NOT EXISTS (SELECT 1 FROM kara_songs s WHERE s.id = h.song_id);
  RAISE NOTICE 'Validation 4: Orphaned history entries = %', orphaned_history;
  IF orphaned_history > 0 THEN
    RAISE EXCEPTION 'VALIDATION FAILED: % history entries have invalid song_id!', orphaned_history;
  END IF;

  -- Validation 5
  SELECT COUNT(*) INTO orphaned_members
  FROM kara_song_group_members m WHERE NOT EXISTS (SELECT 1 FROM kara_songs s WHERE s.id = m.song_id);
  RAISE NOTICE 'Validation 5: Orphaned group members = %', orphaned_members;
  IF orphaned_members > 0 THEN
    RAISE EXCEPTION 'VALIDATION FAILED: % group members have invalid song_id!', orphaned_members;
  END IF;

  -- Final counts
  RAISE NOTICE '============================================';
  RAISE NOTICE 'FINAL COUNTS:';
  RAISE NOTICE 'Total songs: %', (SELECT COUNT(*) FROM kara_songs);
  RAISE NOTICE 'Total versions: %', (SELECT COUNT(*) FROM kara_versions);
  RAISE NOTICE 'Total queue entries: %', (SELECT COUNT(*) FROM kara_queue);
  RAISE NOTICE 'Total history entries: %', (SELECT COUNT(*) FROM kara_song_history);
  RAISE NOTICE 'Total group members: %', (SELECT COUNT(*) FROM kara_song_group_members);
  RAISE NOTICE '============================================';
  RAISE NOTICE 'ALL VALIDATIONS PASSED - READY TO COMMIT';
END $$;

-- Uncomment to commit:
-- COMMIT;

-- Uncomment to rollback:
-- ROLLBACK;
