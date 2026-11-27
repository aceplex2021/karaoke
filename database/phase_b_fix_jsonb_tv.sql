-- Fix jsonb ? uuid operator errors ( ? expects text )
CREATE OR REPLACE FUNCTION add_connected_tv(
  p_room_id UUID,
  p_tv_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  v_connected_tvs JSONB;
BEGIN
  SELECT COALESCE(connected_tv_ids, '[]'::jsonb) INTO v_connected_tvs
  FROM kara_rooms
  WHERE id = p_room_id;

  IF NOT (v_connected_tvs ? p_tv_id::text) THEN
    v_connected_tvs := v_connected_tvs || jsonb_build_array(p_tv_id::text);

    UPDATE kara_rooms
    SET connected_tv_ids = v_connected_tvs,
        updated_at = NOW()
    WHERE id = p_room_id;
  END IF;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION set_primary_tv(
  p_room_id UUID,
  p_user_id UUID,
  p_tv_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  v_host_id UUID;
  v_connected_tvs JSONB;
BEGIN
  SELECT host_id, connected_tv_ids INTO v_host_id, v_connected_tvs
  FROM kara_rooms
  WHERE id = p_room_id;

  IF v_host_id IS NULL OR v_host_id != p_user_id THEN
    RAISE EXCEPTION 'Only host can change primary TV';
  END IF;

  v_connected_tvs := COALESCE(v_connected_tvs, '[]'::jsonb);

  IF jsonb_array_length(v_connected_tvs) > 0 THEN
    IF NOT (v_connected_tvs ? p_tv_id::text) THEN
      v_connected_tvs := v_connected_tvs || jsonb_build_array(p_tv_id::text);
    END IF;
  ELSE
    v_connected_tvs := jsonb_build_array(p_tv_id::text);
  END IF;

  UPDATE kara_rooms
  SET primary_tv_id = p_tv_id,
      connected_tv_ids = v_connected_tvs,
      updated_at = NOW()
  WHERE id = p_room_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Hide corrupt migrated rows that sort above real creates
UPDATE kara_rooms
SET is_active = false
WHERE created_at > NOW() + INTERVAL '1 year';

GRANT EXECUTE ON FUNCTION add_connected_tv(UUID, UUID) TO kara_app;
GRANT EXECUTE ON FUNCTION set_primary_tv(UUID, UUID, UUID) TO kara_app;
