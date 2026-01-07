-- Fix: Add missing columns to kara_rooms table
-- Run this in Supabase SQL Editor if you get "column does not exist" errors

-- Add current_entry_id column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'kara_rooms' 
        AND column_name = 'current_entry_id'
    ) THEN
        ALTER TABLE kara_rooms 
        ADD COLUMN current_entry_id UUID;
        
        COMMENT ON COLUMN kara_rooms.current_entry_id IS 'Backend-controlled playback: current playing queue entry';
    END IF;
END $$;

-- Add last_singer_id column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'kara_rooms' 
        AND column_name = 'last_singer_id'
    ) THEN
        ALTER TABLE kara_rooms 
        ADD COLUMN last_singer_id UUID REFERENCES kara_users(id) ON DELETE SET NULL;
        
        COMMENT ON COLUMN kara_rooms.last_singer_id IS 'Round-robin cursor: last singer who had a turn';
    END IF;
END $$;

-- Add FK constraint for current_entry_id (after kara_queue table exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'kara_rooms_current_entry_id_fkey'
    ) THEN
        ALTER TABLE kara_rooms
        ADD CONSTRAINT kara_rooms_current_entry_id_fkey
        FOREIGN KEY (current_entry_id) 
        REFERENCES kara_queue(id) 
        ON DELETE SET NULL;
    END IF;
END $$;

-- Verify columns exist
SELECT 
    column_name, 
    data_type, 
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'kara_rooms' 
AND column_name IN ('current_entry_id', 'last_singer_id')
ORDER BY column_name;

