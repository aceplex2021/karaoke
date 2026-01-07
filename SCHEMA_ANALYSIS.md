# Schema Analysis - Actual Table Structures

## ✅ Discovered Schema Structure

### 1. kara_song_groups
```sql
id                  uuid (PK)
base_title_unaccent text (NOT NULL)  -- Normalized search field!
base_title_display  text (nullable)   -- Display title
created_at          timestamptz
```

**Key Finding:** Uses `base_title_unaccent` for normalized search (not `*_norm` suffix)

### 2. kara_versions
```sql
id          uuid (PK)
song_id     uuid (NOT NULL)  -- References kara_songs.id
key         varchar          -- Pitch/key (e.g., "C", "Dm")
tempo       integer          -- BPM
label       varchar          -- Tone/style label (e.g., "nam", "nu", "remix")
is_default  boolean          -- Default version flag
created_at  timestamptz
```

**Key Findings:**
- `song_id` references `kara_songs` (not `group_id` directly)
- `label` field likely contains tone/style info
- `is_default` flag for default version selection
- No direct `file_id` - must join through `kara_files`

### 3. kara_files
```sql
id               uuid (PK)
version_id       uuid (NOT NULL)  -- References kara_versions.id
type             varchar (NOT NULL)  -- "video", "audio", etc.
storage_path     varchar (NOT NULL)  -- Relative file path
format           varchar            -- "mp4", "mp3", etc.
duration_seconds integer
created_at       timestamptz
```

**Key Findings:**
- `version_id` references `kara_versions.id` (not `song_id`)
- `storage_path` is the source of truth for playback
- `type` field distinguishes video/audio

### 4. kara_song_group_members
```sql
group_id   uuid (NOT NULL)  -- References kara_song_groups.id
song_id    uuid (NOT NULL)  -- References kara_songs.id
created_at timestamptz
```

**Key Finding:** Junction table linking groups to songs

### 5. kara_queue (Current)
```sql
id                     uuid (PK)
room_id                uuid
song_id                uuid  -- Currently references kara_songs.id
user_id                uuid
position               integer
status                 varchar
added_at               timestamptz
started_at             timestamptz
completed_at           timestamptz
round_number           integer
host_override          boolean
host_override_position integer
```

**Key Finding:** No `version_id` column - uses `song_id` currently

## 🔗 Relationship Chain

```
kara_song_groups
  ↓ (via kara_song_group_members)
kara_songs
  ↓ (via kara_versions.song_id)
kara_versions
  ↓ (via kara_files.version_id)
kara_files
```

**Query Path for Search:**
```
1. Search kara_song_groups by base_title_unaccent
2. Join kara_song_group_members to get songs in group
3. Join kara_songs to get song details
4. Join kara_versions to get all versions
5. Join kara_files to get file info
6. Select best_version based on rules
7. Build play_url from kara_files.storage_path
```

## 📊 Data Counts

- **Groups:** 3,519
- **Versions:** 4,852
- **Files:** 4,071
- **Songs:** 4,482
- **Queue:** 0 (no existing data to migrate!)

**Key Finding:** No existing queue data = clean migration path!

## 🎯 Corrected Query Examples

### Sample Group Structure
```sql
SELECT 
  g.id as group_id,
  g.base_title_unaccent,
  g.base_title_display,
  m.song_id,
  s.title as song_title
FROM kara_song_groups g
LEFT JOIN kara_song_group_members m ON g.id = m.group_id
LEFT JOIN kara_songs s ON m.song_id = s.id
LIMIT 5;
```

### Sample Version → File Relationship
```sql
SELECT 
  v.id as version_id,
  v.song_id,
  v.label as tone_style,
  v.key as pitch,
  v.is_default,
  f.id as file_id,
  f.storage_path,
  f.type,
  f.duration_seconds
FROM kara_versions v
LEFT JOIN kara_files f ON v.id = f.version_id
WHERE f.type = 'video'  -- Only video files for playback
LIMIT 5;
```

## 🔍 Missing Information (Need to Verify)

1. **kara_songs structure:** What columns does it have?
   - Need to see: `id`, `title`, `artist`, `language`, etc.

2. **Artist information:** How are artists stored?
   - Is there a `kara_artists` table?
   - How does it relate to songs/groups?

3. **Version selection fields:**
   - What values are in `kara_versions.label`? (nam, nu, remix, etc.)
   - What values are in `kara_versions.key`? (pitch info)

4. **File type filtering:**
   - Should we only use `type = 'video'` files?
   - Are there multiple files per version?

## ✅ Decisions Made

1. **Queue Migration:** Since queue_count = 0, we can safely add `version_id` column
2. **Search Field:** Use `base_title_unaccent` for accent-insensitive search
3. **Display Field:** Use `base_title_display` for UI display
4. **File Selection:** Must join through versions → files
5. **Version Selection:** Use `label` field for tone/style, `is_default` for fallback

## ❓ Questions Still Need Answers

1. What's the structure of `kara_songs` table?
2. How are artists stored and related?
3. What are the actual values in `kara_versions.label`?
4. Should we filter `kara_files` by `type = 'video'`?
5. Can a version have multiple files? (multiple formats?)

