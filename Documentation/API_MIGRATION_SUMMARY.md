# API Migration Summary - New Schema

**Date:** 2026-01-19  
**Purpose:** Updated all API routes to use new simplified database schema where `kara_versions` is the primary table.

---

## Schema Changes Recap

### OLD Schema (REMOVED)
- `kara_songs` - Main song table
- `kara_song_group_members` - Many-to-many join table
- `kara_artists` - Separate artist table
- `kara_song_versions_detail_view` - Complex view for metadata

### NEW Schema (CURRENT)
- `kara_versions` - **Primary table** with ALL metadata
  - `title_display`, `title_clean`, `normalized_title`
  - `tone`, `mixer`, `style`
  - `artist_name`, `performance_type`
  - `key`, `tempo`, `label`
  - `group_id` (foreign key to `kara_song_groups`)
  - `is_default`, `is_tram`
- `kara_song_groups` - Song groups (simplified)
  - `base_title_display`, `base_title_unaccent`
- `kara_files` - File storage (unchanged structure)
  - `version_id` (foreign key to `kara_versions`)

---

## API Routes Updated

### 1. Search APIs

#### `/api/songs/search` (Primary Search)
**Before:** Complex joins through `kara_song_groups` → `kara_song_group_members` → `kara_songs` → `kara_artists`

**After:** Direct query on `kara_versions` with `kara_files` join
```typescript
supabaseAdmin
  .from('kara_versions')
  .select(`
    id, title_display, tone, mixer, style, artist_name, 
    performance_type, key, tempo, is_default,
    kara_files!inner (id, storage_path, duration_seconds, type)
  `)
  .ilike('title_display', `%${searchTerm}%`)
  .eq('kara_files.type', 'video')
```

**Returns:** Flat list of `VersionSearchResult[]` (YouTube-like, one card per version)

---

#### `/api/songs/search-versions` (Alias)
**Status:** Updated to match `/api/songs/search` (identical implementation)

---

### 2. Version Lookup APIs

#### `/api/songs/[songId]` (Get Single Version)
**Before:** Queried `kara_songs` table

**After:** Queries `kara_versions` table directly
```typescript
supabaseAdmin
  .from('kara_versions')
  .select(`
    id, title_display, tone, mixer, style, artist_name,
    performance_type, key, tempo, is_default,
    kara_files!inner (id, storage_path, duration_seconds, type)
  `)
  .eq('id', songId)
```

**Note:** `songId` parameter is now actually a `version_id`

---

#### `/api/songs/versions` (Get Versions by Group/Title)
**Before:** Used `kara_song_versions_detail_view`

**After:** Queries `kara_versions` directly with group_id or title_clean filter
```typescript
// By group_id (preferred)
supabaseAdmin.from('kara_versions')
  .select('...')
  .eq('group_id', groupId)
  .eq('kara_files.type', 'video')

// By title_clean (fallback for backward compatibility)
supabaseAdmin.from('kara_versions')
  .select('...')
  .ilike('title_clean', titleClean)
```

---

#### `/api/songs/group/[groupId]/versions` (Get All Versions in Group)
**Before:** 
- Queried `kara_song_group_members` for song_ids
- Joined `kara_songs` for artist info
- Complex multi-step process

**After:** Single direct query on `kara_versions`
```typescript
supabaseAdmin
  .from('kara_versions')
  .select(`
    id, title_display, tone, mixer, style, artist_name,
    performance_type, key, tempo, label, is_default,
    kara_files!inner (id, storage_path, type)
  `)
  .eq('group_id', groupId)
  .eq('kara_files.type', 'video')
```

---

#### `/api/songs/[songId]/group` (Get Group from Song/Version)
**Before:** 
- Looked up `kara_song_group_members` by song_id
- Fetched group, members, artists separately
- Multiple queries

**After:** Single query on `kara_versions` to get group_id
```typescript
// Get version with group_id
supabaseAdmin.from('kara_versions')
  .select('id, group_id, title_display, tone, mixer, ...')
  .eq('id', songId)

// Then get other versions in same group
supabaseAdmin.from('kara_versions')
  .select('...')
  .eq('group_id', version.group_id)
```

---

### 3. Queue APIs

#### `/api/queue/add` (Add to Queue)
**Before:** 
- If `song_id` provided, looked up default version in `kara_song_versions`
- Complex version selection logic

**After:** Simplified
- `version_id` or `song_id` accepted (treated as same in new schema)
- Direct validation against `kara_versions` table
```typescript
// Validate version exists
supabaseAdmin.from('kara_versions')
  .select('id')
  .eq('id', finalVersionId)
```

**Note:** Queue still stores `version_id` (same as before)

---

### 4. Room State API

#### `/api/rooms/[roomId]/state` (Get Current State)
**Before:** 
- Joined `kara_versions` → `kara_songs` → `kara_files`
- Complex nested joins

**After:** Direct joins (no `kara_songs`)
```typescript
supabaseAdmin.from('kara_queue')
  .select(`
    *,
    kara_versions!version_id (
      id, title_display, tone, mixer, style, artist_name,
      performance_type,
      kara_files!version_id (storage_path, type, duration_seconds)
    ),
    kara_users!user_id (*)
  `)
```

**Backward Compatibility:** Still maps to legacy `Song` format for frontend
```typescript
const song = version ? {
  id: version.id,
  title: version.title_display,
  artist: version.artist_name || null,
  // ... other fields
  media_url
} : null;
```

---

### 5. History & Favorites APIs

#### `/api/songs/history/[roomId]/[userId]` (Room-specific History)
**Before:** Joined `kara_song_history` → `kara_songs`

**After:** Joins `kara_song_history` → `kara_versions`
```typescript
supabaseAdmin.from('kara_song_history')
  .select(`
    *,
    kara_versions (id, title_display, tone, mixer, style, artist_name, performance_type)
  `)
```

---

#### `/api/users/[userId]/history/recent` (Recent Songs)
**Before:** Complex fallback logic with `kara_songs`

**After:** Simple join with `kara_versions`
```typescript
supabaseAdmin.from('kara_song_history')
  .select(`
    *,
    kara_versions (id, title_display, tone, mixer, style, artist_name, performance_type)
  `)
  .eq('user_id', userId)
```

---

#### `/api/users/[userId]/favorites` (User Favorites)
**Before:** Queried `kara_songs` table

**After:** Queries `kara_versions` table
```typescript
supabaseAdmin.from('kara_versions')
  .select('id, title_display, tone, mixer, style, artist_name, performance_type')
  .in('id', favoriteSongIds)
```

**Note:** `favorite_song_ids` now stores `version_id` values

---

## Breaking Changes

### For Frontend/Clients

1. **Song ID ≈ Version ID**
   - In new schema, there's no separate `song` concept
   - What was `song_id` is now `version_id`
   - Most APIs accept either for backward compatibility

2. **Metadata Location**
   - ALL metadata now in `kara_versions` table
   - No need to join `kara_songs` or `kara_artists`
   - Simpler, faster queries

3. **Search Results Format**
   - Search returns flat list of versions (not grouped)
   - Each result has full metadata inline (no joins needed client-side)

4. **History & Favorites**
   - These now store `version_id` instead of `song_id`
   - APIs return `version` object instead of `song` object
   - Backward compatibility: some endpoints still map to legacy `Song` format

---

## Performance Improvements

1. **Fewer Database Queries**
   - OLD: 4-6 queries per search (groups → members → songs → artists → versions → files)
   - NEW: 1 query per search (`kara_versions` with `kara_files` join)

2. **Faster Response Times**
   - No complex view materialization
   - Direct index lookups on `kara_versions`

3. **Simpler Caching**
   - Single table to cache
   - No complex join invalidation logic

---

## Backward Compatibility

### Maintained
- `/api/queue/add` accepts both `song_id` and `version_id`
- `/api/rooms/[roomId]/state` maps to legacy `Song` format
- `/api/songs/versions` supports both `group_id` and `title_clean` params

### Removed
- Old search API (grouped results with `best_version` selection)
- Complex version selection logic (now client-side or explicit)

---

## Testing Checklist

- [ ] Search returns results with all metadata (tone, mixer, style, artist)
- [ ] Version detail page loads correctly
- [ ] Add to queue works (version_id stored)
- [ ] Room state shows playing song with media_url
- [ ] History shows previously sung songs
- [ ] Favorites loads user's saved versions
- [ ] Group versions page shows all variations

---

## Next Steps

1. **Test Search** - Verify metadata display once DB migration completes
2. **Update Frontend** - Update React components to use new response formats
3. **Deploy** - Push to production after validation
