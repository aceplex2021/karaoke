# 🔄 Database Revamp: Simplified Schema with Enhanced Parser
**Date:** 2026-01-18  
**Status:** Planning Phase  
**Goal:** Align database schema with parseFilename-enhanced.js capabilities

---

## 📋 Executive Summary

### **The Problem**
Current schema splits metadata across 5 tables with complex joins and views. Parser output (80% accurate) is discarded because DB columns don't exist or data is split incorrectly.

### **The Solution**
**kara_versions IS the song.** Each version (tone + mixer + style combination) is the atomic unit users care about. Store ALL parsed metadata directly in one table.

### **Key Benefits**
- ✅ **Simple:** 3 tables instead of 5, no views needed
- ✅ **Fast:** Direct queries, indexed search, no complex joins
- ✅ **Accurate:** Parser output → DB (1:1 mapping, no data loss)
- ✅ **Maintainable:** Clear data model, easier debugging
- ✅ **Scalable:** Indexed columns, efficient queries

---

## 🎯 Design Philosophy

### **Old Thinking (Wrong):**
```
Abstract Song: "Khi Đã Yêu"
  └─ Version 1: Nam tone
  └─ Version 2: Nữ tone
  └─ Version 3: Song Ca
```

### **New Thinking (Correct):**
```
Version 1 = "Khi Đã Yêu" + Nam + Kim Quy + Ballad
Version 2 = "Khi Đã Yêu" + Nữ + Trọng Hiếu + Beat
Version 3 = "Khi Đã Yêu" + Song Ca + Gia Huy + Nhạc Sống
```

**Each version is a complete, standalone entity.**

---

## 🏗️ New Schema Design

### **Core Tables (3 total)**

#### **1. kara_versions (MAIN TABLE)**
```sql
CREATE TABLE kara_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Optional grouping for UI (e.g., "3 versions of this song")
  group_id UUID REFERENCES kara_song_groups(id) ON DELETE SET NULL,
  
  -- Title fields (from parseFilename-enhanced.js)
  title_display VARCHAR(500) NOT NULL,           -- "Khi Đã Yêu"
  title_clean VARCHAR(500) NOT NULL,             -- Cleaned version
  normalized_title VARCHAR(500) NOT NULL,        -- Searchable normalized
  base_title_unaccent TEXT,                      -- For grouping: "khi da yeu"
  
  -- Tone & Voice (from parseFilename-enhanced.js)
  tone VARCHAR(50),                              -- 'Nam', 'Nữ', null
  is_tram BOOLEAN DEFAULT false,                 -- Low pitch/register
  
  -- Channel/Mixer (from parseFilename-enhanced.js)
  mixer VARCHAR(255),                            -- Kim Quy, Trọng Hiếu, Gia Huy, etc.
  
  -- Style (from parseFilename-enhanced.js)
  style VARCHAR(255),                            -- Ballad, Bolero, Beat, Nhạc Sống, etc.
  
  -- Artist (from parseFilename-enhanced.js)
  artist_name VARCHAR(500),                      -- Trịnh Công Sơn, Duy Mạnh, etc.
  
  -- Performance Type (from parseFilename-enhanced.js)
  performance_type VARCHAR(50) DEFAULT 'solo' 
    CHECK (performance_type IN ('solo', 'duet', 'group', 'medley')),
  
  -- Musical Metadata (from parseFilename-enhanced.js)
  key VARCHAR(50),                               -- C, G#m, Ebm, F, etc.
  tempo INTEGER,                                 -- BPM (optional)
  label VARCHAR(255),                            -- Computed: "nam_ballad_tram"
  
  -- System Fields
  language_id UUID NOT NULL REFERENCES kara_languages(id),
  is_default BOOLEAN DEFAULT false,              -- Is this the "original" version?
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Uniqueness: Same title + language + label = same version
  UNIQUE(normalized_title, language_id, label)
);

-- Indexes for fast search
CREATE INDEX idx_versions_title_display ON kara_versions(title_display);
CREATE INDEX idx_versions_normalized_title ON kara_versions(normalized_title);
CREATE INDEX idx_versions_base_title_unaccent ON kara_versions(base_title_unaccent);
CREATE INDEX idx_versions_tone ON kara_versions(tone);
CREATE INDEX idx_versions_mixer ON kara_versions(mixer);
CREATE INDEX idx_versions_style ON kara_versions(style);
CREATE INDEX idx_versions_artist_name ON kara_versions(artist_name);
CREATE INDEX idx_versions_performance_type ON kara_versions(performance_type);
CREATE INDEX idx_versions_group_id ON kara_versions(group_id);
CREATE INDEX idx_versions_language_id ON kara_versions(language_id);

-- Full-text search index
CREATE INDEX idx_versions_title_search ON kara_versions 
  USING GIN (to_tsvector('simple', title_display));

-- Comments
COMMENT ON TABLE kara_versions IS 'Each row represents a unique version (tone + mixer + style combination). This is the atomic unit for search.';
COMMENT ON COLUMN kara_versions.tone IS 'Voice gender: Nam (male), Nữ (female), or null (instrumental/unknown)';
COMMENT ON COLUMN kara_versions.mixer IS 'Channel/mixer name extracted from filename (dynamically loaded from channelSources.md)';
COMMENT ON COLUMN kara_versions.style IS 'Musical style: Ballad, Bolero, Beat, Nhạc Sống, etc.';
COMMENT ON COLUMN kara_versions.artist_name IS 'Composer/artist name extracted from filename (parentheses, dash patterns, etc.)';
COMMENT ON COLUMN kara_versions.performance_type IS 'Solo (1 singer), duet (2), group (3+), or medley (multiple songs)';
COMMENT ON COLUMN kara_versions.label IS 'Computed label combining tone + style + tram (e.g., "nam_ballad_tram")';
```

#### **2. kara_files (unchanged)**
```sql
CREATE TABLE kara_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id UUID NOT NULL REFERENCES kara_versions(id) ON DELETE CASCADE,
  
  type VARCHAR(20) NOT NULL CHECK (type IN ('video', 'audio', 'backing', 'lyrics')),
  storage_path VARCHAR(1000) NOT NULL UNIQUE,
  format VARCHAR(10),                            -- mp4, mp3, etc.
  duration_seconds INTEGER,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_files_version_id ON kara_files(version_id);
CREATE INDEX idx_files_type ON kara_files(type);
CREATE UNIQUE INDEX idx_files_storage_path ON kara_files(storage_path);

COMMENT ON TABLE kara_files IS 'Media files (video, audio, backing tracks, lyrics) for each version';
COMMENT ON COLUMN kara_files.type IS 'File type: video (main karaoke), audio (audio-only), backing (instrumental), lyrics (text)';
```

#### **3. kara_song_groups (optional, for UI grouping)**
```sql
CREATE TABLE kara_song_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  base_title_unaccent TEXT NOT NULL UNIQUE,      -- "khi da yeu"
  base_title_display TEXT,                       -- "Khi Đã Yêu"
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_groups_base_title ON kara_song_groups(base_title_unaccent);

COMMENT ON TABLE kara_song_groups IS 'Optional grouping for UI to show "3 versions of this song"';
COMMENT ON COLUMN kara_song_groups.base_title_unaccent IS 'Normalized, unaccented base title for grouping';
```

### **Supporting Tables (unchanged)**

#### **kara_languages**
```sql
CREATE TABLE kara_languages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(10) NOT NULL UNIQUE,              -- 'vi', 'en', 'zh', etc.
  name VARCHAR(100) NOT NULL                     -- 'Vietnamese', 'English', etc.
);

CREATE UNIQUE INDEX idx_languages_code ON kara_languages(code);

-- Seed data
INSERT INTO kara_languages (code, name) VALUES 
  ('vi', 'Vietnamese'),
  ('en', 'English'),
  ('zh', 'Chinese'),
  ('ko', 'Korean'),
  ('ja', 'Japanese')
ON CONFLICT (code) DO NOTHING;
```

#### **kara_users** (unchanged)
```sql
CREATE TABLE kara_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint VARCHAR(255) UNIQUE,
  auth_user_id UUID,
  display_name VARCHAR(255),
  preferred_language VARCHAR(10),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_fingerprint ON kara_users(fingerprint);
```

#### **kara_rooms** (unchanged)
```sql
CREATE TABLE kara_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_code VARCHAR(6) UNIQUE NOT NULL,
  room_name VARCHAR(255) NOT NULL,
  host_id UUID REFERENCES kara_users(id),
  current_entry_id UUID,  -- FK to kara_queue (added later)
  last_singer_id UUID REFERENCES kara_users(id),
  queue_mode VARCHAR(50) DEFAULT 'round_robin',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_active BOOLEAN DEFAULT true
);

CREATE INDEX idx_rooms_code ON kara_rooms(room_code);
CREATE INDEX idx_rooms_host ON kara_rooms(host_id);
```

#### **kara_queue** (updated to reference kara_versions directly)
```sql
CREATE TABLE kara_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES kara_rooms(id) ON DELETE CASCADE,
  version_id UUID NOT NULL REFERENCES kara_versions(id),  -- Direct reference!
  user_id UUID NOT NULL REFERENCES kara_users(id),
  position INTEGER NOT NULL,
  status VARCHAR(20) DEFAULT 'pending' 
    CHECK (status IN ('pending', 'playing', 'completed', 'skipped')),
  round_number INTEGER,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_queue_room ON kara_queue(room_id);
CREATE INDEX idx_queue_version ON kara_queue(version_id);
CREATE INDEX idx_queue_status ON kara_queue(status);
CREATE INDEX idx_queue_position ON kara_queue(room_id, position);
CREATE UNIQUE INDEX idx_queue_one_playing_per_room ON kara_queue(room_id) 
  WHERE status = 'playing';
```

### **Tables to DROP (no longer needed)**
```sql
DROP VIEW IF EXISTS kara_song_versions_detail_view CASCADE;
DROP VIEW IF EXISTS kara_song_versions_view CASCADE;
DROP VIEW IF EXISTS kara_files_with_title_norm CASCADE;
DROP VIEW IF EXISTS kara_files_with_title_clean CASCADE;
DROP VIEW IF EXISTS kara_files_parsed_preview CASCADE;

DROP TABLE IF EXISTS kara_song_group_members CASCADE;  -- No longer needed
DROP TABLE IF EXISTS kara_songs CASCADE;                -- THE BIG ONE - removed!
DROP TABLE IF EXISTS kara_song_history CASCADE;        -- Clean up old data
```

---

## 🔄 Data Flow (New)

### **Ingestion: Node Controller → Database**
```
1. MeTube downloads video → /Videos/Incoming/
2. watchVideos.js detects new file
3. parseFilename-enhanced.js extracts metadata:
   {
     title_display, title_clean, normalized_title,
     tone, mixer, style, artist_name, performance_type,
     key, is_tram, label
   }
4. dbUpsert-enhanced.js writes ALL fields to kara_versions
5. File moved to /Videos/ (storage_path stored in kara_files)
```

### **Search: Frontend → API → Database**
```
1. User types "khi" in search box
2. Frontend calls /api/songs/search-versions?q=khi
3. API queries kara_versions directly:
   SELECT v.*, f.storage_path, f.duration_seconds
   FROM kara_versions v
   JOIN kara_files f ON f.version_id = v.id
   WHERE v.title_display ILIKE '%khi%' AND f.type = 'video'
   ORDER BY v.title_display
   LIMIT 50
4. API returns complete metadata (no view, no parsing)
5. Frontend renders VersionCard with all metadata
```

### **Queue: User adds song to room**
```
1. User clicks "Add to Queue" on version card
2. Frontend sends version_id to /api/queue/add
3. API inserts into kara_queue (direct FK to kara_versions)
4. Playback reads version metadata + file path in one join
```

---

## 📝 Node Controller Changes

### **Update dbUpsert-enhanced.js**

```javascript
// dbUpsert-enhanced.js
import { getSupabase } from "./supabase.js";
import { toTitleCase } from "./titleCase.js";

/**
 * Compute base title for grouping (remove accents, lowercase, trim)
 */
function computeBaseTitleFromNormalized(normalizedTitle) {
  let s = String(normalizedTitle || "").toLowerCase().trim();
  if (!s) return "";

  // Remove pipes and extra whitespace
  while (s.startsWith("｜") || s.startsWith("|")) s = s.slice(1).trim();
  const seg = (s.split("｜")[0] ?? s).trim();
  const seg2 = (seg.split("|")[0] ?? seg).trim();
  const collapsed = seg2.replace(/\s+/g, " ").trim();

  // Remove accents
  const folded = collapsed
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d");

  return folded;
}

/**
 * Get language ID by code
 */
async function getLanguageIdByCode(code) {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("kara_languages")
    .select("id")
    .eq("code", code)
    .maybeSingle();

  if (error) throw error;
  if (!data?.id) {
    throw new Error(`Language code '${code}' not found. Seed kara_languages first.`);
  }

  return data.id;
}

/**
 * Create or get song group (for UI grouping only)
 */
async function ensureGroup({ baseTitle, displayTitle }) {
  const supabase = getSupabase();
  
  if (!baseTitle) return null;

  const { data, error } = await supabase
    .from("kara_song_groups")
    .upsert(
      {
        base_title_unaccent: baseTitle,
        base_title_display: displayTitle || null,
      },
      { onConflict: "base_title_unaccent" }
    )
    .select("id")
    .single();

  if (error) {
    console.warn("Group creation failed (non-blocking):", error.message);
    return null;
  }

  return data;
}

/**
 * Main upsert function - writes ALL parsed metadata to kara_versions
 */
export async function upsertSongVersionFile({
  meta,
  relativePath,
  defaultLanguageCode = "vi",
}) {
  const supabase = getSupabase();

  // 1. Get language ID
  const languageId = await getLanguageIdByCode(defaultLanguageCode);

  // 2. Compute base title for grouping
  const baseTitle = computeBaseTitleFromNormalized(meta.normalized_title);
  const displayTitle = toTitleCase(meta.title_clean || meta.title_display);

  // 3. Ensure group exists (optional, for UI)
  let groupId = null;
  try {
    const group = await ensureGroup({ baseTitle, displayTitle });
    groupId = group?.id || null;
  } catch (e) {
    console.warn("Group creation failed (non-blocking):", e.message);
  }

  // 4. Upsert version with ALL parser fields
  const versionPayload = {
    group_id: groupId,
    
    // Title fields
    title_display: displayTitle,
    title_clean: meta.title_clean || displayTitle,
    normalized_title: meta.normalized_title,
    base_title_unaccent: baseTitle,
    
    // Metadata from parser
    tone: meta.tone || null,
    mixer: meta.mixer || meta.channel || null,  // Parser returns both
    style: meta.style || null,
    artist_name: meta.artist_name || null,
    performance_type: meta.performance_type || 'solo',
    is_tram: meta.is_tram || false,
    
    // Musical metadata
    key: meta.key || null,
    tempo: null,  // Parser doesn't extract this yet
    label: meta.label || 'original',
    
    // System fields
    language_id: languageId,
    is_default: !meta.label || meta.label === 'original',
  };

  const { data: version, error: versionError } = await supabase
    .from("kara_versions")
    .upsert(versionPayload, {
      onConflict: "normalized_title,language_id,label",
    })
    .select("id")
    .single();

  if (versionError) throw versionError;

  // 5. Insert file record
  const { error: fileError } = await supabase
    .from("kara_files")
    .insert({
      version_id: version.id,
      type: "video",
      storage_path: relativePath,
      format: "mp4",
    });

  if (fileError) {
    const msg = (fileError.message || "").toLowerCase();
    // Ignore duplicate errors (file already exists)
    if (!msg.includes("duplicate") && !msg.includes("unique")) {
      throw fileError;
    }
  }

  return version;
}
```

### **Update watchVideos.js (minimal changes)**

```javascript
// metaForDbFromParsed - now just passes parser output directly
function metaForDbFromParsed(p) {
  return {
    normalized_title: p?.normalized_title || null,
    title_clean: p?.title_clean || p?.title_display || null,
    title_display: p?.title_display || null,
    label: p?.label || 'original',
    key: p?.key || null,
    tone: p?.tone || null,
    mixer: p?.mixer || p?.channel || null,
    style: p?.style || null,
    artist_name: p?.artist_name || null,
    performance_type: p?.performance_type || 'solo',
    is_tram: p?.is_tram || false,
  };
}
```

---

## 🖥️ Frontend/API Changes

### **New Search API: /api/songs/search-versions/route.ts**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function buildPlayUrl(storagePath: string): string {
  const filename = storagePath.startsWith('/') ? storagePath.slice(1) : storagePath;
  return `${process.env.MEDIA_SERVER_URL}/${encodeURIComponent(filename)}`;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const q = searchParams.get('q') || '';
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);

  if (!q || q.length < 2) {
    return NextResponse.json({ 
      query: q, 
      results: [], 
      total: 0 
    });
  }

  try {
    const searchTerm = q.trim().toLowerCase();

    // Simple, direct query - NO VIEWS, NO JOINS TO SONGS TABLE
    const { data, error } = await supabaseAdmin
      .from('kara_versions')
      .select(`
        id,
        title_display,
        normalized_title,
        tone,
        mixer,
        style,
        artist_name,
        performance_type,
        key,
        tempo,
        label,
        kara_files!inner (
          id,
          storage_path,
          duration_seconds
        )
      `)
      .ilike('title_display', `%${searchTerm}%`)
      .eq('kara_files.type', 'video')
      .order('title_display', { ascending: true })
      .limit(limit);

    if (error) {
      throw new Error(`Search failed: ${error.message}`);
    }

    if (!data || data.length === 0) {
      return NextResponse.json({ 
        query: searchTerm, 
        results: [], 
        total: 0 
      });
    }

    // Map results (deduplicate if multiple files per version)
    const versionMap = new Map();
    
    for (const version of data) {
      if (versionMap.has(version.id)) continue;
      
      const file = Array.isArray(version.kara_files) 
        ? version.kara_files[0] 
        : version.kara_files;
      
      versionMap.set(version.id, {
        version_id: version.id,
        song_title: version.title_display,
        artist_name: version.artist_name,
        tone: version.tone,
        mixer: version.mixer,
        style: version.style,
        performance_type: version.performance_type,
        pitch: version.key,
        tempo: version.tempo,
        storage_path: file.storage_path,
        duration_seconds: file.duration_seconds,
        play_url: buildPlayUrl(file.storage_path),
      });
    }

    const results = Array.from(versionMap.values());

    // Client-side sorting: exact matches first, then alphabetical
    const queryLower = searchTerm.toLowerCase();
    results.sort((a, b) => {
      const titleA = a.song_title.toLowerCase();
      const titleB = b.song_title.toLowerCase();

      const aExact = titleA.startsWith(queryLower);
      const bExact = titleB.startsWith(queryLower);

      if (aExact && !bExact) return -1;
      if (!aExact && bExact) return 1;

      return titleA.localeCompare(titleB);
    });

    return NextResponse.json({
      query: searchTerm,
      results,
      total: results.length,
    });
  } catch (error: any) {
    console.error('[search-versions] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Search failed' },
      { status: 500 }
    );
  }
}
```

### **Update Queue API: /api/queue/add/route.ts**

```typescript
// Simplified - just reference version_id directly
export async function POST(request: NextRequest) {
  const { roomId, versionId, userId } = await request.json();

  // Get next position
  const { data: queueItems } = await supabase
    .from('kara_queue')
    .select('position')
    .eq('room_id', roomId)
    .order('position', { ascending: false })
    .limit(1);

  const nextPosition = queueItems?.[0]?.position + 1 || 1;

  // Insert queue item (direct FK to kara_versions)
  const { data, error } = await supabase
    .from('kara_queue')
    .insert({
      room_id: roomId,
      version_id: versionId,  // Direct reference!
      user_id: userId,
      position: nextPosition,
      status: 'pending',
    })
    .select()
    .single();

  if (error) throw error;
  return NextResponse.json(data);
}
```

### **Update Current Song API: /api/queue/[roomId]/current/route.ts**

```typescript
// Simplified join - version has ALL metadata
export async function GET(request: NextRequest, { params }: { params: { roomId: string } }) {
  const { data, error } = await supabase
    .from('kara_queue')
    .select(`
      id,
      position,
      status,
      started_at,
      kara_versions (
        id,
        title_display,
        artist_name,
        tone,
        mixer,
        style,
        key,
        kara_files!inner (
          storage_path,
          duration_seconds
        )
      ),
      kara_users (
        display_name
      )
    `)
    .eq('room_id', params.roomId)
    .eq('status', 'playing')
    .single();

  if (error || !data) {
    return NextResponse.json({ current: null });
  }

  const version = data.kara_versions;
  const file = Array.isArray(version.kara_files) 
    ? version.kara_files[0] 
    : version.kara_files;

  return NextResponse.json({
    current: {
      queue_id: data.id,
      version_id: version.id,
      title: version.title_display,
      artist: version.artist_name,
      tone: version.tone,
      mixer: version.mixer,
      style: version.style,
      pitch: version.key,
      play_url: buildPlayUrl(file.storage_path),
      duration_seconds: file.duration_seconds,
      singer: data.kara_users?.display_name,
      started_at: data.started_at,
    }
  });
}
```

### **Frontend: No Changes Needed!**

The frontend already expects this structure from the search API. The `VersionCard` component will display all metadata correctly because the API now returns complete data.

---

## 📋 **Migration Execution Plan**

### **⚠️ CRITICAL: Data Deletion Strategy**

**YOU MUST CHOOSE** between two approaches:

| Aspect | Option A: NUCLEAR | Option B: SELECTIVE |
|--------|-------------------|---------------------|
| **Users** | ❌ Deleted | ✅ Preserved |
| **Rooms** | ❌ Deleted | ✅ Preserved (queues empty) |
| **Queue** | ❌ Deleted | ❌ Deleted |
| **Songs** | ❌ Deleted | ❌ Deleted |
| **Files** | ✅ Preserved | ✅ Preserved |
| **Best for** | Dev/Staging | Production |
| **Complexity** | Low | Medium |
| **Disruption** | High | Medium |

**Why we delete data:**
- ❌ Old `kara_queue` points to old `kara_songs.id` (BROKEN after drop)
- ❌ Old `kara_versions` has no metadata columns (inconsistent)
- ❌ Cannot migrate data (old schema incompatible)
- ✅ Clean slate ensures consistency

**How we backfill:**
1. ✅ Video files still exist on TrueNAS (`/Videos/` untouched)
2. ✅ Move files to `/Incoming/` → Node Controller re-processes
3. ✅ `parseFilename-enhanced.js` extracts metadata (80% accurate)
4. ✅ `dbUpsert-enhanced.js` writes to new `kara_versions` table
5. ✅ Result: Complete, consistent data with rich metadata

---

## 🚀 Migration Execution Plan

### **Phase 1: Backup & Preparation (15 min)**

#### **Step 1.1: Backup Current Database**
```bash
# In Supabase Dashboard → Database → Backups → Create Manual Backup
# Or export current data (optional):
```

```sql
-- Export current data (if you want to preserve anything)
COPY (
  SELECT * FROM kara_song_versions_detail_view
) TO '/tmp/old_versions.csv' WITH CSV HEADER;
```

#### **Step 1.2: Create Migration File**
Create `database/migrations/2026-01-18_revamp_simplified_schema.sql`

---

### **Phase 2: Choose Data Retention Strategy**

**CRITICAL DECISION:** Choose ONE option based on your environment.

---

#### **Option A: NUCLEAR (Recommended for Dev/Staging)**

**What Gets Deleted:**
- ✅ ALL data from ALL tables
- ✅ Complete fresh start
- ✅ No orphaned records

**What Gets Preserved:**
- ✅ Table structures (schema)
- ✅ Indexes, constraints
- ❌ Zero data

**SQL Command:**
```sql
BEGIN;

-- Delete ALL data
TRUNCATE TABLE kara_queue CASCADE;
TRUNCATE TABLE kara_room_participants CASCADE;
TRUNCATE TABLE kara_rooms CASCADE;
TRUNCATE TABLE kara_users CASCADE;
TRUNCATE TABLE kara_user_preferences CASCADE;
TRUNCATE TABLE kara_song_history CASCADE;
TRUNCATE TABLE kara_song_groups CASCADE;

-- Drop old structures
DROP VIEW IF EXISTS kara_song_versions_detail_view CASCADE;
DROP VIEW IF EXISTS kara_song_versions_view CASCADE;
DROP VIEW IF EXISTS kara_files_with_title_norm CASCADE;
DROP VIEW IF EXISTS kara_files_with_title_clean CASCADE;
DROP VIEW IF EXISTS kara_files_parsed_preview CASCADE;

DROP TABLE IF EXISTS kara_song_group_members CASCADE;
DROP TABLE IF EXISTS kara_songs CASCADE;
DROP TABLE IF EXISTS kara_song_history CASCADE;
DROP TABLE IF EXISTS kara_files CASCADE;
DROP TABLE IF EXISTS kara_versions CASCADE;

COMMIT;
```

**Backfill Strategy:**
1. Re-scan all files → populates `kara_versions` + `kara_files`
2. Users re-create accounts (automatic via fingerprint)
3. Hosts re-create rooms
4. Users add songs to queue

**Pros:**
- ✅ Clean, simple, no complexity
- ✅ No orphaned data
- ✅ Fast execution (< 1 min)

**Cons:**
- ❌ All users/rooms/queues lost
- ❌ User display names lost

**Best for:** Dev, staging, small user base

---

#### **Option B: SELECTIVE (Recommended for Production)**

**What Gets Deleted:**
- ✅ Queue items (depend on old songs)
- ✅ Song history
- ✅ Old song/version tables

**What Gets Preserved:**
- ✅ Users (accounts, fingerprints, display names)
- ✅ Rooms (structure, room codes, hosts)
- ✅ Room participants
- ✅ User preferences

**SQL Command:**
```sql
BEGIN;

-- Delete only song-dependent data
TRUNCATE TABLE kara_queue CASCADE;
TRUNCATE TABLE kara_song_history CASCADE;
TRUNCATE TABLE kara_song_groups CASCADE;

-- Reset room state (no current song)
UPDATE kara_rooms 
SET current_entry_id = NULL,
    last_singer_id = NULL,
    updated_at = NOW();

-- Drop old structures (same as Option A)
DROP VIEW IF EXISTS kara_song_versions_detail_view CASCADE;
DROP VIEW IF EXISTS kara_song_versions_view CASCADE;
DROP VIEW IF EXISTS kara_files_with_title_norm CASCADE;
DROP VIEW IF EXISTS kara_files_with_title_clean CASCADE;
DROP VIEW IF EXISTS kara_files_parsed_preview CASCADE;

DROP TABLE IF EXISTS kara_song_group_members CASCADE;
DROP TABLE IF EXISTS kara_songs CASCADE;
DROP TABLE IF EXISTS kara_song_history CASCADE;
DROP TABLE IF EXISTS kara_files CASCADE;
DROP TABLE IF EXISTS kara_versions CASCADE;

COMMIT;
```

**Backfill Strategy:**
1. Re-scan all files → populates `kara_versions` + `kara_files`
2. Users automatically reconnect (fingerprints still work)
3. Rooms stay active (codes still work)
4. Users add songs to existing rooms

**Pros:**
- ✅ Users don't lose accounts
- ✅ Rooms stay active
- ✅ Display names preserved
- ✅ Minimal disruption

**Cons:**
- ❌ All queues wiped (current songs lost)
- ❌ Queue history lost

**Best for:** Production with active users

---

**⚠️ IMPORTANT:** Run the chosen SQL in Supabase SQL Editor or via CLI.

---

### **Phase 3: Create New Schema (10 min)**

```sql
-- ============================================
-- PHASE 3: CREATE NEW SCHEMA
-- ============================================

-- Create kara_song_groups (optional, for UI grouping)
CREATE TABLE kara_song_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  base_title_unaccent TEXT NOT NULL UNIQUE,
  base_title_display TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_groups_base_title ON kara_song_groups(base_title_unaccent);

COMMENT ON TABLE kara_song_groups IS 'Optional grouping for UI to show "3 versions of this song"';

-- Create new kara_versions (MAIN TABLE with ALL fields)
CREATE TABLE kara_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  group_id UUID REFERENCES kara_song_groups(id) ON DELETE SET NULL,
  
  -- Title fields
  title_display VARCHAR(500) NOT NULL,
  title_clean VARCHAR(500) NOT NULL,
  normalized_title VARCHAR(500) NOT NULL,
  base_title_unaccent TEXT,
  
  -- Metadata
  tone VARCHAR(50),
  mixer VARCHAR(255),
  style VARCHAR(255),
  artist_name VARCHAR(500),
  performance_type VARCHAR(50) DEFAULT 'solo' 
    CHECK (performance_type IN ('solo', 'duet', 'group', 'medley')),
  is_tram BOOLEAN DEFAULT false,
  
  -- Musical
  key VARCHAR(50),
  tempo INTEGER,
  label VARCHAR(255),
  
  -- System
  language_id UUID NOT NULL REFERENCES kara_languages(id),
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(normalized_title, language_id, label)
);

-- Indexes
CREATE INDEX idx_versions_title_display ON kara_versions(title_display);
CREATE INDEX idx_versions_normalized_title ON kara_versions(normalized_title);
CREATE INDEX idx_versions_base_title_unaccent ON kara_versions(base_title_unaccent);
CREATE INDEX idx_versions_tone ON kara_versions(tone);
CREATE INDEX idx_versions_mixer ON kara_versions(mixer);
CREATE INDEX idx_versions_style ON kara_versions(style);
CREATE INDEX idx_versions_artist_name ON kara_versions(artist_name);
CREATE INDEX idx_versions_performance_type ON kara_versions(performance_type);
CREATE INDEX idx_versions_group_id ON kara_versions(group_id);
CREATE INDEX idx_versions_language_id ON kara_versions(language_id);
CREATE INDEX idx_versions_title_search ON kara_versions 
  USING GIN (to_tsvector('simple', title_display));

-- Comments
COMMENT ON TABLE kara_versions IS 'Each row = unique version (tone + mixer + style). Atomic unit for search.';
COMMENT ON COLUMN kara_versions.tone IS 'Voice gender: Nam, Nữ, or null';
COMMENT ON COLUMN kara_versions.mixer IS 'Channel/mixer from channelSources.md';
COMMENT ON COLUMN kara_versions.style IS 'Musical style: Ballad, Bolero, Beat, etc.';
COMMENT ON COLUMN kara_versions.artist_name IS 'Composer/artist from filename';
COMMENT ON COLUMN kara_versions.performance_type IS 'solo, duet, group, or medley';

-- Create new kara_files
CREATE TABLE kara_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id UUID NOT NULL REFERENCES kara_versions(id) ON DELETE CASCADE,
  
  type VARCHAR(20) NOT NULL CHECK (type IN ('video', 'audio', 'backing', 'lyrics')),
  storage_path VARCHAR(1000) NOT NULL UNIQUE,
  format VARCHAR(10),
  duration_seconds INTEGER,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_files_version_id ON kara_files(version_id);
CREATE INDEX idx_files_type ON kara_files(type);
CREATE UNIQUE INDEX idx_files_storage_path ON kara_files(storage_path);

COMMENT ON TABLE kara_files IS 'Media files for each version';
```

---

### **Phase 4: Update Node Controller (15 min)**

#### **Step 4.1: Update dbUpsert-enhanced.js**
Copy the new `dbUpsert-enhanced.js` code from Section "Node Controller Changes" above.

#### **Step 4.2: Update watchVideos.js**
Update `metaForDbFromParsed()` to pass all parser fields.

#### **Step 4.3: Test Locally**
```bash
# Set WRITE_DB=false for dry-run first
cd Controller
node --env-file=.env scanVideos.js
```

Check output - should show parser extracting all fields without errors.

---

### **Phase 5: Deploy Node Controller (10 min)**

#### **Step 5.1: Copy to TrueNAS**
```bash
# From Windows
scp Controller/dbUpsert-enhanced.js root@truenas:/mnt/HomeServer/Media/Music/Karaoke/Controller/dbUpsert.js
scp Controller/watchVideos.js root@truenas:/mnt/HomeServer/Media/Music/Karaoke/Controller/
```

#### **Step 5.2: Restart Node Controller**
```bash
ssh root@truenas
docker restart ix-karaoke-node-karaoke-node-1
docker logs -f ix-karaoke-node-karaoke-node-1
```

Watch for errors. Should see "🧠 Supabase upsert enabled (WRITE_DB=true)".

---

### **Phase 6: Re-scan Files & Backfill Data (30 min - 2 hours)**

**THIS IS CRITICAL:** After dropping tables, we have empty `kara_versions` and `kara_files`. This phase populates them.

#### **Understanding Backfill Process**

```
Current State (after Phase 3):
- kara_versions: 0 records (empty)
- kara_files: 0 records (empty)
- kara_song_groups: 0 records (empty)

Files on TrueNAS:
- /Videos/: ~8,000 MP4 files (UNCHANGED - files not deleted!)

Backfill Process:
1. Move files to /Incoming/ folder
2. Node Controller detects them
3. parseFilename-enhanced.js extracts metadata
4. dbUpsert-enhanced.js writes to kara_versions
5. Files moved back to /Videos/
6. kara_files table populated with storage paths

Result:
- kara_versions: ~8,000 records (with complete metadata)
- kara_files: ~8,000 records (with storage paths)
```

#### **Step 6.1: Trigger Re-scan**

**Method A: Move Files to /Incoming (RECOMMENDED)**
```bash
ssh root@truenas
cd /mnt/HomeServer/Media/Music/Karaoke/Videos

# Test with 10 files first
ls *.mp4 | head -10 > /tmp/test_files.txt
cat /tmp/test_files.txt | xargs -I {} mv {} Incoming/

# Watch Node Controller process them
docker logs -f ix-karaoke-node-karaoke-node-1

# Expected output:
# 🗄️ upserted metadata: Song_Title__nam.mp4
# ✅ promoted+deleted incoming: Song_Title__nam.mp4

# If successful (no errors), move ALL files
ls *.mp4 | xargs -I {} mv {} Incoming/
```

**Method B: Touch Files (Alternative - NOT RECOMMENDED)**
```bash
# Updates file modification time, triggers re-processing
find /mnt/HomeServer/Media/Music/Karaoke/Videos -name "*.mp4" -exec touch {} \;

# Note: Method A is cleaner (explicit re-ingestion)
```

#### **Step 6.2: Monitor Progress**
```bash
# Check how many versions are being created
watch -n 5 'psql -h localhost -U postgres -d postgres -c "SELECT COUNT(*) FROM kara_versions"'
```

#### **Step 6.3: Verify Data Quality**
```sql
-- Check a few records
SELECT 
  title_display,
  tone,
  mixer,
  style,
  artist_name,
  performance_type
FROM kara_versions 
LIMIT 10;

-- Check for missing metadata
SELECT 
  COUNT(*) as total,
  COUNT(tone) as has_tone,
  COUNT(mixer) as has_mixer,
  COUNT(style) as has_style,
  COUNT(artist_name) as has_artist
FROM kara_versions;

-- Should see 80%+ coverage on tone, mixer, style
```

---

### **Phase 7: Update Frontend (10 min)**

#### **Step 7.1: Update Search API**
Replace `src/app/api/songs/search-versions/route.ts` with new code (see above).

#### **Step 7.2: Update Queue Add API**
Update `src/app/api/queue/add/route.ts` to use `version_id` directly.

#### **Step 7.3: Update Current Song API**
Update `src/app/api/queue/[roomId]/current/route.ts` with simplified join.

#### **Step 7.4: Test Locally**
```bash
npm run dev

# Test search
curl "http://localhost:3000/api/songs/search-versions?q=khi"

# Should return:
# {
#   "query": "khi",
#   "results": [
#     {
#       "version_id": "...",
#       "song_title": "Khi Đã Yêu",
#       "artist_name": "...",
#       "tone": "Nam",
#       "mixer": "Kim Quy",
#       "style": "Ballad",
#       ...
#     }
#   ],
#   "total": 3
# }
```

---

### **Phase 8: Testing & Verification (30 min)**

#### **Test 1: Search Accuracy**
```bash
# Search for common songs
curl "http://localhost:3000/api/songs/search-versions?q=khi"
curl "http://localhost:3000/api/songs/search-versions?q=dem"
curl "http://localhost:3000/api/songs/search-versions?q=tinh"

# Verify:
# - All results have complete metadata
# - tone, mixer, style fields populated
# - Different versions are distinguishable
```

#### **Test 2: Frontend Display**
1. Open browser to `http://localhost:3000/room/ABC123`
2. Search for "khi"
3. **Verify cards show:**
   - ✅ Song title
   - ✅ Artist name (if extracted)
   - ✅ Tone chip (Male/Female)
   - ✅ Mixer chip (Kim Quy, Trọng Hiếu, etc.)
   - ✅ Style chip (Ballad, Beat, Nhạc Sống, etc.)
4. **Verify different versions are distinguishable**

#### **Test 3: Add to Queue**
1. Click "Add to Queue" on a version
2. Verify queue item appears
3. Check database:
```sql
SELECT q.*, v.title_display, v.tone, v.mixer
FROM kara_queue q
JOIN kara_versions v ON v.id = q.version_id
WHERE q.room_id = '...';
```

#### **Test 4: Playback**
1. Start playback on queued item
2. Verify video plays
3. Check `/api/queue/[roomId]/current` returns complete metadata

#### **Test 5: Performance**
```bash
# Benchmark search speed
time curl "http://localhost:3000/api/songs/search-versions?q=khi"

# Should be < 100ms for indexed search
```

---

### **Phase 9: Deploy to Production (15 min)**

#### **Step 9.1: Commit Changes**
```bash
git add database/migrations/2026-01-18_revamp_simplified_schema.sql
git add Controller/dbUpsert-enhanced.js
git add Controller/watchVideos.js
git add src/app/api/songs/search-versions/route.ts
git add src/app/api/queue/add/route.ts
git add src/app/api/queue/[roomId]/current/route.ts

git commit -m "Database revamp: Simplified schema with enhanced parser

- Drop kara_songs table (versions are the atomic unit)
- Add all parser fields to kara_versions (tone, mixer, style, artist, etc.)
- Simplify search (direct query, no views)
- Update Node Controller to write all metadata
- Update frontend APIs to use new schema"

git push origin main
```

#### **Step 9.2: Deploy to Vercel**
Vercel will auto-deploy on push to `main`.

Wait for deployment, then test:
```bash
curl "https://your-app.vercel.app/api/songs/search-versions?q=khi"
```

---

## ✅ Success Criteria

After migration complete:

### **Database**
- ✅ `kara_versions` has 15+ columns with all parser fields
- ✅ `kara_songs` table dropped
- ✅ No views exist
- ✅ All indexes created
- ✅ Foreign keys valid

### **Data Quality**
- ✅ 80%+ of versions have `tone` populated
- ✅ 80%+ of versions have `mixer` populated
- ✅ 70%+ of versions have `style` populated
- ✅ 60%+ of versions have `artist_name` populated
- ✅ 100% of versions have `title_display` populated

### **Search Performance**
- ✅ Search query < 100ms (indexed)
- ✅ Search returns complete metadata (no missing fields)
- ✅ Search results sorted correctly (exact match first)
- ✅ No duplicate results

### **Frontend Display**
- ✅ Cards show all metadata (title, artist, tone, mixer, style)
- ✅ Users can distinguish different versions
- ✅ Preview works
- ✅ Add to queue works
- ✅ Playback works

### **Node Controller**
- ✅ Ingestion writes all fields
- ✅ No errors in logs
- ✅ Files processed successfully
- ✅ Database updated correctly

---

## 🚫 Rollback Plan

If something goes wrong:

### **Immediate Rollback (< 5 min)**

#### **Step 1: Restore DB from Backup**
In Supabase Dashboard:
1. Go to Database → Backups
2. Click "Restore" on the backup from before migration
3. Confirm restore

#### **Step 2: Revert Code Changes**
```bash
git revert HEAD
git push origin main
```

Vercel will auto-deploy the reverted code.

#### **Step 3: Restart Node Controller**
```bash
ssh root@truenas
docker restart ix-karaoke-node-karaoke-node-1
```

### **Partial Rollback (Keep New Schema, Fix Code)**

If new schema is good but code has bugs:

1. Keep database as-is
2. Fix code bugs locally
3. Test thoroughly
4. Redeploy fixed code

---

## 📊 Performance Expectations

### **Query Performance**

```sql
-- Search query (indexed on title_display)
SELECT * FROM kara_versions v
JOIN kara_files f ON f.version_id = v.id
WHERE v.title_display ILIKE '%khi%' AND f.type = 'video'
LIMIT 50;

-- Expected: < 50ms for 10K versions
-- Expected: < 100ms for 100K versions
```

### **Indexing Strategy**

**GIN Index (Full-text search):**
```sql
CREATE INDEX idx_versions_title_search ON kara_versions 
  USING GIN (to_tsvector('simple', title_display));

-- For more sophisticated search:
SELECT * FROM kara_versions
WHERE to_tsvector('simple', title_display) @@ to_tsquery('simple', 'khi & da & yeu');
```

**B-tree Indexes (Exact match, sorting):**
- `title_display` - for ILIKE queries and sorting
- `normalized_title` - for exact lookups
- `tone`, `mixer`, `style` - for filtering

### **Storage Estimates**

For 10,000 versions:
- `kara_versions`: ~5 MB (500 bytes per row × 10K)
- `kara_files`: ~1 MB (100 bytes per row × 10K)
- Indexes: ~10 MB
- **Total: ~16 MB** (negligible)

Title duplication is not a concern.

---

## 🎉 Summary

### **What We're Doing**
1. Dropping old `kara_songs` table
2. Moving ALL metadata to `kara_versions`
3. Removing complex views
4. Simplifying queries
5. Achieving 1:1 parser → DB mapping

### **Why This Works**
- ✅ Versions ARE the atomic unit users care about
- ✅ Simpler code = fewer bugs
- ✅ Faster queries (direct, indexed)
- ✅ Complete metadata (no data loss)
- ✅ Maintainable (clear schema)

### **Time Estimate**
- **Preparation:** 15 min
- **Migration:** 10 min
- **Node Controller:** 15 min
- **Re-scan:** 30 min - 2 hours (depends on # of files)
- **Frontend:** 10 min
- **Testing:** 30 min
- **Deploy:** 15 min
- **Total:** ~2-4 hours

### **Risk Level**
**LOW** - We're in development, dropping and recreating is safe. Files are preserved.

### **Expected Outcome**
Users will finally see **distinguishable versions** in search results:
- "Khi Đã Yêu (Nam, Kim Quy, Ballad)"
- "Khi Đã Yêu (Nữ, Trọng Hiếu, Beat)"
- "Khi Đã Yêu (Song Ca, Gia Huy, Nhạc Sống)"

**Ready to execute?** 🚀
