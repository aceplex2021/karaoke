-- Fix kara_queue foreign key to point to new kara_versions table
-- Run this in Supabase SQL Editor

BEGIN;

-- Drop old foreign key constraint if it exists
ALTER TABLE kara_queue 
  DROP CONSTRAINT IF EXISTS kara_queue_version_id_fkey;

-- Add new foreign key constraint to new kara_versions table
ALTER TABLE kara_queue
  ADD CONSTRAINT kara_queue_version_id_fkey 
  FOREIGN KEY (version_id) 
  REFERENCES kara_versions(id) 
  ON DELETE CASCADE;

-- Reload schema cache for PostgREST
NOTIFY pgrst, 'reload schema';

COMMIT;

-- Verify the constraint was created
SELECT
  tc.table_name, 
  kcu.column_name, 
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name 
FROM information_schema.table_constraints AS tc 
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY' 
  AND tc.table_name='kara_queue'
  AND kcu.column_name = 'version_id';
