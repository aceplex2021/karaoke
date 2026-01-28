-- ============================================
-- v5.0: Host Can Set Primary TV
-- ============================================
-- Allows host to change primary_tv_id after room creation
-- Uses database function for security (host verification)
-- Tracks connected TVs in JSONB array for dropdown selection
-- ============================================

-- Add column to track connected TVs
ALTER TABLE kara_rooms
ADD COLUMN IF NOT EXISTS connected_tv_ids JSONB DEFAULT '[]'::jsonb;

-- Create index for JSONB queries
CREATE INDEX IF NOT EXISTS idx_rooms_connected_tv_ids 
ON kara_rooms USING GIN (connected_tv_ids);

-- Add comment
COMMENT ON COLUMN kara_rooms.connected_tv_ids IS 
  'Array of connected TV IDs. Format: ["tv-id-1", "tv-id-2", ...]. Updated when TVs register/disconnect.';

-- Function to update primary_tv_id (host-only, secure)
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
  -- Get host_id for the room
  SELECT host_id, connected_tv_ids INTO v_host_id, v_connected_tvs
  FROM kara_rooms
  WHERE id = p_room_id;
  
  -- Verify user is host
  IF v_host_id IS NULL OR v_host_id != p_user_id THEN
    RAISE EXCEPTION 'Only host can change primary TV';
  END IF;
  
  -- Verify TV is in connected list (optional check - allows setting any TV)
  -- If connected_tv_ids is empty or null, allow any TV ID
  IF v_connected_tvs IS NOT NULL AND jsonb_array_length(v_connected_tvs) > 0 THEN
    IF NOT (v_connected_tvs ? p_tv_id) THEN
      -- TV not in connected list, but allow anyway (host can set any TV)
      -- Optionally add it to the list
      v_connected_tvs := v_connected_tvs || jsonb_build_array(p_tv_id);
    END IF;
  ELSE
    -- No connected TVs yet, initialize with this TV
    v_connected_tvs := jsonb_build_array(p_tv_id);
  END IF;
  
  -- Update primary_tv_id and connected_tv_ids
  UPDATE kara_rooms
  SET primary_tv_id = p_tv_id,
      connected_tv_ids = v_connected_tvs,
      updated_at = NOW()
  WHERE id = p_room_id;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to add TV to connected list (called when TV registers)
CREATE OR REPLACE FUNCTION add_connected_tv(
  p_room_id UUID,
  p_tv_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  v_connected_tvs JSONB;
BEGIN
  -- Get current connected TVs
  SELECT COALESCE(connected_tv_ids, '[]'::jsonb) INTO v_connected_tvs
  FROM kara_rooms
  WHERE id = p_room_id;
  
  -- Add TV if not already in list
  IF NOT (v_connected_tvs ? p_tv_id) THEN
    v_connected_tvs := v_connected_tvs || jsonb_build_array(p_tv_id);
    
    -- Update room
    UPDATE kara_rooms
    SET connected_tv_ids = v_connected_tvs,
        updated_at = NOW()
    WHERE id = p_room_id;
  END IF;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION set_primary_tv(UUID, UUID, UUID) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION add_connected_tv(UUID, UUID) TO authenticated, anon, service_role;

-- Add comments
COMMENT ON FUNCTION set_primary_tv IS 
  'Allows host to change primary_tv_id. Verifies host_id before updating. Adds TV to connected list if not present. Returns true on success, raises exception if not host.';

COMMENT ON FUNCTION add_connected_tv IS 
  'Adds a TV ID to the connected_tv_ids array when TV registers. Called by register-tv API.';
