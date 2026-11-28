-- Persist primary TV playhead so secondaries can poll across Node workers.
ALTER TABLE kara_rooms
  ADD COLUMN IF NOT EXISTS tv_playhead JSONB;

COMMENT ON COLUMN kara_rooms.tv_playhead IS
  'Last primary playhead {entryId,t,paused,wallMs} for multi-TV sync';
