-- Migration: Add queue_mode to kara_rooms
-- Safe to run on existing database (adds column with default)
-- Date: 2026-01-13
-- Phase III: Smart Features

-- Add queue_mode column to kara_rooms table
ALTER TABLE kara_rooms 
ADD COLUMN IF NOT EXISTS queue_mode VARCHAR(20) DEFAULT 'fifo' 
CHECK (queue_mode IN ('round_robin', 'fifo'));

-- Add comment for documentation
COMMENT ON COLUMN kara_rooms.queue_mode IS 
  'Queue ordering mode: round_robin (fair rotation) or fifo (first come first serve)';

-- Update existing rooms to have explicit mode (safety measure)
UPDATE kara_rooms 
SET queue_mode = 'fifo' 
WHERE queue_mode IS NULL;

-- Verify the column was added
-- SELECT column_name, data_type, column_default 
-- FROM information_schema.columns 
-- WHERE table_name = 'kara_rooms' AND column_name = 'queue_mode';
