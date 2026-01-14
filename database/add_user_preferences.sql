-- Migration: Add user preferences table
-- Phase III: Smart Features
-- Date: 2026-01-13

-- User preferences table
CREATE TABLE IF NOT EXISTS kara_user_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES kara_users(id) ON DELETE CASCADE,
    preferred_language VARCHAR(10) DEFAULT 'en',
    preferred_version_type VARCHAR(20), -- 'nam', 'nu', 'nam_nu', etc.
    auto_add_favorite BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id)
);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_user_preferences_user ON kara_user_preferences(user_id);

-- Add comment
COMMENT ON TABLE kara_user_preferences IS 
  'User preferences for language, version type, and other settings';
