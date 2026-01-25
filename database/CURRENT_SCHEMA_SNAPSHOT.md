# Current Database Schema Snapshot
**Date**: 2026-01-24  
**Purpose**: Baseline for v5.0 authentication & payments implementation

## Tables Overview

| Table | Columns | Notes |
|-------|---------|-------|
| kara_files | 7 | Media files for versions |
| kara_languages | 3 | Reference table |
| kara_queue | 17 | Has YouTube support (youtube_url, source_type, metadata, sort_key) |
| kara_room_participants | 10 | Has approval fields (role, status, approved_at, expires_at, user_name) |
| kara_rooms | 15 | Has subscription_tier, expires_at, approval_mode, primary_tv_id, current_song_started_at |
| kara_song_groups | 4 | Song grouping |
| kara_song_history | 8 | User song history |
| kara_user_preferences | 8 | Has favorite_song_ids (JSONB) |
| kara_users | 7 | Has auth_user_id (unused) |
| kara_versions | 19 | Main song table |

## Key Columns Already Available for v5.0

### kara_users
- `auth_user_id UUID` - ✅ Ready for Supabase Auth integration
- `fingerprint VARCHAR(255) UNIQUE` - Keep for guest/anonymous users
- `display_name VARCHAR(255)`

### kara_rooms
- `subscription_tier VARCHAR(50)` DEFAULT 'free' - ✅ Can reuse for tier tracking
- `expires_at TIMESTAMPTZ` - ✅ Can reuse for 24hr one-time payment expiry
- **Missing**: payment_id, payment_type (need to add)

### kara_user_preferences
- `favorite_song_ids JSONB` DEFAULT '[]' - ✅ Already exists
- **Missing**: subscription_id, max_favorites_limit (need to add)

## Constraints

### Primary Keys
All tables have UUID primary keys on `id` column

### Unique Constraints
- `kara_users.fingerprint` - UNIQUE
- `kara_rooms.room_code` - UNIQUE
- `kara_languages.code` - UNIQUE
- `kara_files.storage_path` - UNIQUE
- `kara_room_participants(room_id, user_id)` - UNIQUE (composite)
- `kara_user_preferences.user_id` - UNIQUE
- `kara_versions(normalized_title, language_id, label)` - UNIQUE (composite)

### Important: No constraint on active rooms per user
Currently **no constraint** preventing multiple active rooms per user.

## Schema Differences from COMPLETE_SCHEMA_V3.1.sql

### kara_user_preferences
- **Current**: Has `id` as PRIMARY KEY + `user_id UNIQUE`
- **Schema file**: Has `user_id` as PRIMARY KEY (no separate id column)
- **Impact**: Minor - both work, current is more flexible

### kara_user_preferences.favorite_song_ids
- **Current**: `jsonb` (correct for new implementation)
- **Schema file**: `TEXT[]` (old implementation)
- **Status**: Already migrated ✅

### kara_languages
- **Current**: Missing `created_at TIMESTAMPTZ`
- **Schema file**: Has `created_at`
- **Impact**: None for functionality

## Columns Added After v3.1 (v4.x features)

### kara_queue
- `youtube_url TEXT`
- `source_type TEXT` DEFAULT 'database'
- `metadata JSONB` DEFAULT '{}'
- `sort_key NUMERIC` NOT NULL DEFAULT 1000.0

### kara_rooms
- `approval_mode TEXT` DEFAULT 'auto'
- `primary_tv_id UUID`
- `current_song_started_at TIMESTAMPTZ`

### kara_room_participants
- `role VARCHAR(20)` DEFAULT 'participant'
- `status TEXT` DEFAULT 'approved'
- `approved_at TIMESTAMPTZ`
- `expires_at TIMESTAMPTZ`
- `user_name VARCHAR(255)`

## v5.0 Migration Plan

### New Tables Needed (2)
1. **kara_subscriptions** - User subscription tracking
2. **kara_room_payments** - One-time room payment tracking

### New Columns Needed (4)
1. `kara_rooms.payment_id UUID` - FK to kara_room_payments
2. `kara_rooms.payment_type VARCHAR(20)` - 'subscription' | 'one_time' | NULL
3. `kara_user_preferences.subscription_id UUID` - FK to kara_subscriptions
4. `kara_user_preferences.max_favorites_limit INTEGER` - Cached limit

### New Constraints Needed (1)
1. **Unique index** on `kara_rooms(host_id)` WHERE `is_active = true`
   - Enforces 1 active room per user

### Columns to Reuse
- `kara_users.auth_user_id` - Link to Supabase Auth
- `kara_rooms.subscription_tier` - Track room tier if needed
- `kara_rooms.expires_at` - 24hr expiry for one-time payments
- `kara_user_preferences.favorite_song_ids` - Already JSONB

## Next Steps
1. Review subscription tiers and pricing
2. Create migration SQL for new tables/columns
3. Implement Stripe integration
4. Implement Supabase Auth integration
5. Update frontend for auth/payment flows
