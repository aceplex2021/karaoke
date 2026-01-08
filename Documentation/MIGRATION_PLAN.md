# Migration Plan: Aligning Webapp with Node Controller Contracts

## 📊 Current State vs Required State

### ✅ What We Have (Working)
- Basic room/queue system
- TV + phone UI with playback controls
- Simple song search using `kara_songs` table
- Media playback via HTTP server
- Queue management (add, skip, complete)

### ❌ What's Missing (Per Contracts)
- **Group-aware search** (using `kara_song_groups`)
- **Version selection** (tone/style/pitch variants)
- **Proper data model** (`kara_files`, `kara_versions`, `kara_song_groups`)
- **Accent-insensitive search** (using normalized fields)
- **Server-side best_version selection**

## 🔍 Gap Analysis

### 1. Database Schema Mismatch

**Current Schema:**
```sql
kara_songs (
  id, title, artist, language, file_path, duration
)
```

**Required Schema (from contracts):**
```sql
kara_songs (logical song, normalized fields)
kara_song_groups (groups songs by base title)
kara_song_group_members (song ↔ group mapping)
kara_versions (tone/style variants per song)
kara_files (canonical media files, storage_path)
```

### 2. API Contract Mismatch

**Current:** `/api/songs/search` returns raw `kara_songs[]`

**Required:** Returns grouped results with:
- One result per `kara_song_groups`
- `best_version` selected server-side
- `play_url` built from `kara_files.storage_path`

### 3. Queue Model Mismatch

**Current:** `kara_queue.song_id` → `kara_songs.id`

**Required:** Should reference `kara_versions.id` or `kara_files.id`

## 🎯 Next Logical Steps

### Phase 1: Verify External System State ⚠️ CRITICAL FIRST STEP

**Action:** Check if Node Controller has already populated the new tables

1. **Query Supabase to see what tables exist:**
   ```sql
   SELECT table_name 
   FROM information_schema.tables 
   WHERE table_schema = 'public' 
   AND table_name LIKE 'kara_%';
   ```

2. **If new tables exist, inspect their structure:**
   - `kara_song_groups`
   - `kara_song_group_members`
   - `kara_versions`
   - `kara_files`

3. **Check if data is populated:**
   ```sql
   SELECT COUNT(*) FROM kara_song_groups;
   SELECT COUNT(*) FROM kara_versions;
   SELECT COUNT(*) FROM kara_files;
   ```

**Decision Point:**
- ✅ **If tables exist with data:** Proceed to Phase 2 (refactor APIs)
- ❌ **If tables don't exist:** Need to coordinate with Node Controller team or create migration plan

### Phase 2: Refactor Search API (Group-Aware)

**File:** `src/server/routes/songs.ts`

**Changes:**
1. Replace direct `kara_songs` queries with `kara_song_groups` queries
2. Join with `kara_song_group_members`, `kara_versions`, `kara_files`
3. Implement server-side `best_version` selection logic:
   - Prefer `tone = "nam"` if available
   - Prefer non-remix over remix
   - Prefer standard karaoke over medley
   - Fallback: lowest version_id
4. Build `play_url` from `kara_files.storage_path`
5. Use normalized fields (`*_norm`) for accent-insensitive search

**New Response Shape:**
```typescript
{
  query: string,
  results: Array<{
    group_id: string,
    display_title: string,
    normalized_title: string,
    artists: string[],
    best_version: {
      version_id: string,
      tone: "nam" | "nu" | null,
      pitch: string | null,
      styles: string[],
      file: {
        file_id: string,
        storage_path: string,
        play_url: string
      }
    },
    available: {
      version_count: number,
      tones: string[],
      styles: string[]
    }
  }>
}
```

### Phase 3: Add Version Selection API

**New Endpoint:** `GET /api/songs/group/:groupId/versions`

**Purpose:** Allow users to select specific tone/style variant

**Response:**
```typescript
{
  group_id: string,
  title: string,
  versions: Array<{
    version_id: string,
    tone: string | null,
    pitch: string | null,
    styles: string[],
    duration_s: number | null,
    file: {
      file_id: string,
      storage_path: string,
      play_url: string
    }
  }>
}
```

### Phase 4: Update Queue Model

**Decision Required:** Should queue reference:
- Option A: `kara_versions.id` (recommended - allows version selection)
- Option B: `kara_files.id` (simpler, but loses version metadata)

**Changes:**
1. Update `kara_queue` schema (if needed):
   ```sql
   -- Add version_id column
   ALTER TABLE kara_queue 
   ADD COLUMN version_id UUID REFERENCES kara_versions(id);
   
   -- Migrate existing data (if any)
   -- This requires mapping old song_id to new version_id
   ```

2. Update queue routes to use `kara_versions` instead of `kara_songs`
3. Update queue logic to join with `kara_versions` and `kara_files`

### Phase 5: Update Frontend

**Files to Update:**
- `src/app/room/[code]/page.tsx` (phone search UI)
- `src/app/tv/page.tsx` (TV playback)
- `src/shared/types.ts` (type definitions)
- `src/lib/api.ts` (API client)

**Changes:**
1. Update search results display to show grouped songs
2. Add version selection UI (dropdown/modal for tone/style)
3. Update queue display to show version info
4. Update playback to use `play_url` from API response

### Phase 6: Testing & Validation

1. **Test group-aware search:**
   - Search "Bien" should return one grouped result
   - Should show available versions (nam/nu/etc.)

2. **Test version selection:**
   - User can select specific tone/style
   - Queue stores correct version_id

3. **Test playback:**
   - `play_url` works correctly
   - Media server serves files from `storage_path`

## ⚠️ Critical Questions to Answer First

1. **Has Node Controller already created the new tables?**
   - If yes: Proceed with Phase 2
   - If no: Need migration strategy or wait for Node Controller

2. **Is there existing data in `kara_songs`?**
   - If yes: Need migration script to map to new structure
   - If no: Clean slate, easier migration

3. **What's the relationship between old and new schema?**
   - Can we map `kara_songs.id` → `kara_versions.id`?
   - Or is it a complete rewrite?

## 🚀 Recommended Immediate Action

**Step 1:** Run this query in Supabase SQL Editor:
```sql
-- Check what tables exist
SELECT table_name, 
       (SELECT COUNT(*) FROM information_schema.columns 
        WHERE table_name = t.table_name) as column_count
FROM information_schema.tables t
WHERE table_schema = 'public' 
AND table_name LIKE 'kara_%'
ORDER BY table_name;
```

**Step 2:** Share the results to determine next steps.

## 📝 Notes

- **DO NOT** modify ingestion logic (Node Controller handles this)
- **DO NOT** write to `kara_*` tables (read-only)
- **DO** build APIs that consume the new structure
- **DO** maintain backward compatibility during transition if possible

