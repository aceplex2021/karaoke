# Refactoring Plan: Aligning with Node Controller Contracts

## ✅ Confirmed: All Required Tables Exist

Based on your Supabase query, we have:
- ✅ `kara_song_groups` - Groups songs by base title
- ✅ `kara_song_group_members` - Song ↔ group mapping  
- ✅ `kara_versions` - Tone/style variants
- ✅ `kara_files` - Canonical media files
- ✅ `kara_songs` - Logical songs (role TBD)
- ✅ `kara_queue` - Current queue (needs schema update)
- ✅ `kara_artists`, `kara_languages`, `kara_tags`, etc. (bonus tables)

## 🔍 Critical Questions to Answer (Before Coding)

### Question 1: Table Structure Inspection
**Action Required:** Run these queries in Supabase SQL Editor to understand the schema:

```sql
-- Inspect kara_song_groups structure
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'kara_song_groups'
ORDER BY ordinal_position;

-- Inspect kara_versions structure
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'kara_versions'
ORDER BY ordinal_position;

-- Inspect kara_files structure
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'kara_files'
ORDER BY ordinal_position;

-- Inspect kara_song_group_members structure
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'kara_song_group_members'
ORDER BY ordinal_position;
```

**Why:** We need to know:
- What normalized fields exist (`*_norm` columns)?
- How `kara_versions` relates to `kara_files`?
- What fields exist for tone/style/pitch?
- How groups relate to songs and versions?

### Question 2: Data Population Check
**Action Required:** Check if data exists:

```sql
-- Check data counts
SELECT 
  (SELECT COUNT(*) FROM kara_song_groups) as groups_count,
  (SELECT COUNT(*) FROM kara_versions) as versions_count,
  (SELECT COUNT(*) FROM kara_files) as files_count,
  (SELECT COUNT(*) FROM kara_songs) as songs_count,
  (SELECT COUNT(*) FROM kara_queue) as queue_count;
```

**Why:** 
- If counts are 0: Node Controller hasn't run yet → wait or use old system
- If counts > 0: Proceed with refactoring
- If queue_count > 0: Need migration strategy

### Question 3: Relationship Mapping
**Action Required:** Understand the data model:

```sql
-- Sample a group to see structure
SELECT * FROM kara_song_groups LIMIT 1;


-- See how groups relate to members
SELECT 
  g.id as group_id,
  g.display_title,
  m.song_id,
  s.title as song_title
FROM kara_song_groups g
LEFT JOIN kara_song_group_members m ON g.id = m.group_id
LEFT JOIN kara_songs s ON m.song_id = s.id
LIMIT 5;

-- See how versions relate to files
SELECT 
  v.id as version_id,
  v.tone,
  v.pitch,
  f.id as file_id,
  f.storage_path
FROM kara_versions v
LEFT JOIN kara_files f ON v.file_id = f.id
LIMIT 5;
```

**Why:** Need to understand:
- How to join groups → members → songs → versions → files
- What the foreign key relationships are
- How to build the query for search API

### Question 4: Queue Schema Decision
**Action Required:** Check current `kara_queue` structure:

```sql
-- Check if version_id column exists
SELECT column_name 
FROM information_schema.columns
WHERE table_name = 'kara_queue';
```

**Decision Needed:**
- **Option A:** Add `version_id` column to `kara_queue` (recommended)
  - Queue references specific version (tone/style)
  - Allows version selection per queue item
  - More flexible for future features
  
- **Option B:** Keep `song_id`, join to get default version
  - Simpler migration
  - Less flexible
  - May need to change later

**Recommendation:** Option A (add `version_id`), but need to:
1. Check if column exists
2. If not, add it
3. Migrate existing queue items (if any)

## 📋 Detailed Refactoring Steps (After Questions Answered)

### Phase 1: Understand Data Model ✅ (Do This First)

**Tasks:**
1. Run all SQL queries above
2. Document the actual schema structure
3. Map relationships between tables
4. Identify normalized search fields
5. Understand version selection fields

**Deliverable:** Document with actual table structures and relationships

### Phase 2: Refactor Search API

**File:** `src/server/routes/songs.ts`

**Current Implementation:**
```typescript
// Currently queries kara_songs directly
supabaseAdmin.from('kara_songs').select('*')
```

**New Implementation (Planned):**
```typescript
// Query kara_song_groups with joins
// Join: groups → members → songs → versions → files
// Apply best_version selection logic
// Build play_url from kara_files.storage_path
```

**Changes Required:**
1. Replace `kara_songs` query with `kara_song_groups` query
2. Join through `kara_song_group_members` → `kara_songs` → `kara_versions` → `kara_files`
3. Implement `best_version` selection:
   - Prefer `tone = "nam"` if available
   - Prefer non-remix over remix
   - Prefer standard karaoke over medley
   - Fallback: lowest version_id
4. Use normalized fields (`*_norm`) for accent-insensitive search
5. Build `play_url` from `kara_files.storage_path` + `MEDIA_BASE_URL`
6. Aggregate available tones/styles for each group

**Response Shape:**
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

**Dependencies:**
- Must know table structure (Phase 1)
- Must know normalized field names
- Must know how versions relate to files

### Phase 3: Add Version Selection API

**New Endpoint:** `GET /api/songs/group/:groupId/versions`

**Purpose:** Allow users to see and select specific tone/style variants

**Implementation:**
```typescript
// Query all versions for a group
// Join: group → members → songs → versions → files
// Return all available versions with play_url
```

**Response Shape:**
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

**Dependencies:**
- Phase 2 (understanding joins)
- Must know version fields

### Phase 4: Update Queue Model

**Decision Point:** Add `version_id` to `kara_queue`?

**If Yes (Recommended):**

1. **Schema Update:**
   ```sql
   -- Add version_id column (if doesn't exist)
   ALTER TABLE kara_queue 
   ADD COLUMN IF NOT EXISTS version_id UUID REFERENCES kara_versions(id);
   
   -- Make it nullable initially for migration
   -- Later can make it required
   ```

2. **Migration Strategy (if existing queue data):**
   ```sql
   -- For each queue item, find best version for the song
   -- This requires mapping song_id → group → best_version
   -- Complex migration - may need script
   ```

3. **Update Queue Routes:**
   - `POST /api/queue` - Accept `version_id` instead of `song_id`
   - `GET /api/queue/:roomId` - Join with `kara_versions` and `kara_files`
   - Update `QueueManager` to use `version_id`

4. **Update Queue Logic:**
   - Change `addToQueue` to accept `version_id`
   - Update joins to get file info from `kara_versions` → `kara_files`
   - Build `play_url` from `kara_files.storage_path`

**If No (Simpler, but less flexible):**
- Keep `song_id` in queue
- Join to get default version when fetching queue
- Less flexible for version selection

**Dependencies:**
- Phase 1 (understand relationships)
- Decision on schema approach

### Phase 5: Update Types

**File:** `src/shared/types.ts`

**New Types Needed:**
```typescript
// Group-aware search result
export interface SongGroupResult {
  group_id: string;
  display_title: string;
  normalized_title: string;
  artists: string[];
  best_version: VersionInfo;
  available: {
    version_count: number;
    tones: string[];
    styles: string[];
  };
}

export interface VersionInfo {
  version_id: string;
  tone: "nam" | "nu" | null;
  pitch: string | null;
  styles: string[];
  file: {
    file_id: string;
    storage_path: string;
    play_url: string;
  };
}

// Update QueueItem to use version_id
export interface QueueItem {
  // ... existing fields
  version_id: string; // NEW
  version?: VersionInfo; // NEW - joined data
  // song_id: string; // DEPRECATED (or keep for migration)
}
```

**Dependencies:**
- Phase 2 (know response shape)
- Phase 4 (know queue structure)

### Phase 6: Update Frontend

**Files to Update:**
1. `src/lib/api.ts` - Update API client methods
2. `src/app/room/[code]/page.tsx` - Update search UI
3. `src/app/tv/page.tsx` - Update playback
4. `src/shared/types.ts` - Update types (Phase 5)

**Changes:**
1. **Search UI:**
   - Display grouped results (one per group)
   - Show available versions indicator (e.g., "3 versions: nam, nu, remix")
   - Add "Select Version" button/modal
   - Call version selection API when user wants to choose

2. **Queue Display:**
   - Show version info (tone/style) if available
   - Update to use `play_url` from API

3. **Playback:**
   - Use `play_url` from queue item
   - No longer build URL from `file_path`

**Dependencies:**
- Phase 2 (new API shape)
- Phase 3 (version selection API)
- Phase 4 (queue structure)
- Phase 5 (types)

## 🚨 Risks & Considerations

### Risk 1: Breaking Existing Functionality
**Mitigation:**
- Keep old endpoints working during transition
- Add new endpoints alongside old ones
- Gradual migration with feature flags

### Risk 2: Data Migration Complexity
**If `kara_queue` has existing data:**
- Need to map `song_id` → `version_id`
- May require complex migration script
- Consider: Is it acceptable to lose existing queue data?

### Risk 3: Performance
**Concern:** Complex joins may be slow
**Mitigation:**
- Add proper indexes (Node Controller should have these)
- Test with realistic data volumes
- Consider caching for search results

### Risk 4: Missing Normalized Fields
**If `*_norm` fields don't exist:**
- May need to use unaccent extension
- Or implement client-side normalization
- Or wait for Node Controller to add them

## 📝 Implementation Order (After Questions Answered)

1. **Phase 1:** Understand data model (SQL queries) ✅ **DO THIS FIRST**
2. **Phase 2:** Refactor search API (backend)
3. **Phase 5:** Update types (shared)
4. **Phase 3:** Add version selection API (backend)
5. **Phase 4:** Update queue model (backend + schema)
6. **Phase 6:** Update frontend (UI)

## ✅ Schema Analysis Complete!

**See `SCHEMA_ANALYSIS.md` for full details.**

### Key Discoveries:
1. ✅ **Normalized field:** `base_title_unaccent` (not `*_norm`)
2. ✅ **Display field:** `base_title_display`
3. ✅ **Version fields:** `label` (tone/style), `key` (pitch), `is_default`
4. ✅ **File relationship:** `kara_files.version_id` → `kara_versions.id`
5. ✅ **Queue:** No existing data (clean migration!)
6. ✅ **Relationship chain:** groups → members → songs → versions → files

### Still Need:
1. `kara_songs` table structure
2. Artist relationship (how stored?)
3. Sample values in `kara_versions.label`
4. File type filtering strategy

## 🚀 Ready to Proceed

With the schema understood, we can now:
1. Write the correct join queries
2. Implement best_version selection logic
3. Build play_url from storage_path
4. Update queue to use version_id

**Next:** Need a few more queries to complete the picture (see SCHEMA_ANALYSIS.md)

