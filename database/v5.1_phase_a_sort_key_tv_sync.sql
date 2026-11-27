-- ============================================================================
-- v5.1 Phase A: sort_key-first queue + advance lock + started_at stamp
-- Optional SQL to align Supabase RPCs with app-layer Phase A fixes.
-- App works without this (reorder/advance implemented in API), but applying
-- keeps RPC callers and cron helpers consistent.
-- ============================================================================

BEGIN;

-- advance_playback: order by sort_key, advisory lock, stamp current_song_started_at
CREATE OR REPLACE FUNCTION advance_playback(p_room_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_lock_key BIGINT;
  v_current_id UUID;
  v_current_user_id UUID;
  v_current_version_id UUID;
  v_next_id UUID;
  v_existing_history_id UUID;
BEGIN
  v_lock_key := ('x' || substr(md5(p_room_id::text), 1, 16))::bit(64)::bigint;
  PERFORM pg_advisory_xact_lock(v_lock_key);

  SELECT id, user_id, version_id
  INTO v_current_id, v_current_user_id, v_current_version_id
  FROM kara_queue
  WHERE room_id = p_room_id AND status = 'playing'
  LIMIT 1;

  IF v_current_id IS NOT NULL THEN
    UPDATE kara_queue
    SET status = 'completed', completed_at = NOW()
    WHERE id = v_current_id;

    IF v_current_version_id IS NOT NULL AND v_current_user_id IS NOT NULL THEN
      SELECT id INTO v_existing_history_id
      FROM kara_song_history
      WHERE user_id = v_current_user_id
        AND version_id = v_current_version_id
      LIMIT 1;

      IF v_existing_history_id IS NOT NULL THEN
        UPDATE kara_song_history
        SET times_sung = times_sung + 1,
            sung_at = NOW(),
            room_id = p_room_id,
            updated_at = NOW()
        WHERE id = v_existing_history_id;
      ELSE
        INSERT INTO kara_song_history (room_id, user_id, version_id, sung_at, times_sung)
        VALUES (p_room_id, v_current_user_id, v_current_version_id, NOW(), 1);
      END IF;
    END IF;
  END IF;

  SELECT id INTO v_next_id
  FROM kara_queue
  WHERE room_id = p_room_id AND status = 'pending'
  ORDER BY sort_key ASC
  LIMIT 1;

  IF v_next_id IS NOT NULL THEN
    UPDATE kara_queue
    SET status = 'playing', started_at = NOW()
    WHERE id = v_next_id;

    UPDATE kara_rooms
    SET current_entry_id = v_next_id,
        current_song_started_at = NOW(),
        updated_at = NOW()
    WHERE id = p_room_id;

    RETURN TRUE;
  ELSE
    UPDATE kara_rooms
    SET current_entry_id = NULL,
        current_song_started_at = NULL,
        updated_at = NOW()
    WHERE id = p_room_id;

    RETURN FALSE;
  END IF;
END;
$$ LANGUAGE plpgsql;

COMMIT;
