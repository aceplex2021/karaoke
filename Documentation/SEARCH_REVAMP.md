# YouTube-Like Search Revamp - Implementation Plan

## 🎯 Phase 1 Goal (Locked)

Deliver a YouTube-like mobile search experience where users can see every version, tap to hear a 10-second preview, and add to queue confidently — without caching, without pre-generated clips, and without DB changes.

### 0️⃣ Non-Goals (Explicitly Excluded)

To keep scope tight, Phase 1 will NOT include:

- ❌ Hover previews (desktop-only behavior)
- ❌ Preview pre-generation
- ❌ Preview metadata in DB
- ❌ Ranking ML / personalization
- ❌ Background caching layers

Everything below works today with existing infrastructure.

### Design Decisions

1. **Flat list** - Similar to YouTube; no grouping
2. **Search results** - Use `kara_song_versions_detail_view` directly
3. **User interaction** - Use buttons for better visual; "Add to Queue" and "Play Preview", no gesture; click/select only
4. **Complete revamp** - Will replace everything in current version
5. **Button-based** - No tap-and-hold gestures (simplified UX)

---

## 📋 Pre-Implementation Checklist

### ✅ Rules Policy Compliance
- **Mixer/Channel names**: Will be loaded dynamically from `Controller/channelSources.md` (no hardcoding)
- **No regression**: Parser logic remains untouched
- **Database**: Only READ operations, no schema changes

### 🔄 Rollback Strategy
**Approach:** Feature branch + file backup

1. Create feature branch: `feature/youtube-search-v1`
2. Backup current search files before modifications
3. Changes are additive (new components, new API routes)
4. Old search remains intact until final switchover
5. Can revert via `git checkout main` anytime

**Critical files to backup:**
- `src/app/api/songs/search/route.ts` (current group-based search)
- `src/app/room/[code]/page.tsx` (search results rendering)
- `src/shared/types.ts` (type definitions)

---

## 📖 Step-by-Step Implementation Plan

### **Phase 1: Database Verification (5 min)**
**Goal:** Confirm `kara_song_versions_detail_view` exists and has required columns

**Actions:**
1. Query Supabase to verify view exists
2. Check columns: `version_id`, `song_id`, `song_title`, `artist_name`, `tone`, `mixer`, `storage_path`, `duration_seconds`
3. Test query performance with ILIKE search

**Files:** None (Supabase only)

**Verification:**
```sql
-- Run in Supabase SQL Editor
SELECT * FROM kara_song_versions_detail_view LIMIT 5;
```

**Expected output:** 5 rows with all required columns

**Rollback:** N/A (read-only)

---

### **Phase 2: Create Feature Branch + Backup (2 min)**
**Goal:** Isolate changes, enable easy rollback

**Commands:**
```bash
git checkout -b feature/youtube-search-v1
git status  # Verify clean state
```

**Backup current files:**
```bash
# Create backup directory
mkdir -p .backups/search-revamp

# Copy critical files
cp src/app/api/songs/search/route.ts .backups/search-revamp/
cp src/app/room/[code]/page.tsx .backups/search-revamp/
cp src/shared/types.ts .backups/search-revamp/
```

**Verification:**
```bash
ls -la .backups/search-revamp/
# Should show 3 files
```

**Rollback:** `git checkout main` (discards all changes)

---

### **Phase 3: Update Type Definitions (10 min)**
**Goal:** Add new types for flat version results

**File:** `src/shared/types.ts`

**Changes:**
```typescript
// ADD NEW (keep existing types intact)

/**
 * Flat version result for YouTube-like search
 * Each card represents ONE version (no grouping)
 */
export interface VersionSearchResult {
  version_id: string;
  song_id: string;
  song_title: string;
  artist_name: string | null;
  tone: string | null;          // 'nam', 'nu', etc.
  mixer: string | null;          // 'Trọng Hiếu', 'Kim Quy', etc.
  style: string | null;          // 'beat', 'acoustic', 'rumba', etc.
  pitch: string | null;          // 'C', 'D#m', etc.
  tempo: number | null;          // BPM
  storage_path: string;
  duration_seconds: number | null;
  play_url: string;              // Full media URL
}

export interface VersionSearchResponse {
  query: string;
  results: VersionSearchResult[];
  total: number;
}
```

**Verification:**
```bash
npm run build
# Should compile with no type errors
```

**Rollback:** `git checkout src/shared/types.ts`

---

### **Phase 4: Create New Search API Endpoint (30 min)**
**Goal:** Flat version search using `kara_song_versions_detail_view`

**File:** `src/app/api/songs/search-versions/route.ts` (NEW)

**Full implementation:**
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/server/lib/supabase';
import { config } from '@/server/config';
import type { VersionSearchResult, VersionSearchResponse } from '@/shared/types';

export const dynamic = 'force-dynamic';

/**
 * Build play URL from storage_path (basename only)
 */
function buildPlayUrl(storagePath: string): string {
  if (!storagePath) return '';
  
  // Extract basename (remove folder prefixes)
  let decoded = decodeURIComponent(storagePath);
  decoded = decoded.trim().replace(/^[/\\]+|[/\\]+$/g, '');
  const parts = decoded.split(/[/\\]+/);
  const basename = parts[parts.length - 1];
  
  return `${config.mediaServer.baseUrl}/${encodeURIComponent(basename)}`;
}

/**
 * Parse label to extract tone, style, and other metadata
 * Examples: "nam", "nu_beat", "nam_acoustic", "beat"
 */
function parseLabel(label: string | null): {
  tone: string | null;
  style: string | null;
} {
  if (!label) return { tone: null, style: null };
  
  const lower = label.toLowerCase().trim();
  
  // Extract tone
  let tone: string | null = null;
  if (lower === 'nam' || lower.startsWith('nam_')) {
    tone = 'nam';
  } else if (lower === 'nu' || lower.startsWith('nu_')) {
    tone = 'nu';
  }
  
  // Extract style (everything after tone, or the whole label if no tone)
  let style: string | null = null;
  if (tone && lower.includes('_')) {
    style = lower.split('_').slice(1).join('_');
  } else if (!tone && lower !== 'nam' && lower !== 'nu') {
    style = lower;
  }
  
  return { tone, style };
}

/**
 * YouTube-like search: Flat list of versions
 * One card per version, no grouping
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const q = searchParams.get('q');
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    
    console.log('[search-versions] Query:', { q, limit });

    // Require search query
    if (!q || !q.trim()) {
      return NextResponse.json<VersionSearchResponse>({
        query: '',
        results: [],
        total: 0,
      });
    }

    const searchTerm = q.trim().toLowerCase();

    // Query kara_song_versions_detail_view directly
    const { data: versions, error, count } = await supabaseAdmin
      .from('kara_song_versions_detail_view')
      .select('*', { count: 'exact' })
      .ilike('song_title', `%${searchTerm}%`)
      .order('song_title', { ascending: true })
      .order('version_id', { ascending: true })
      .limit(limit);

    if (error) {
      throw new Error(`Search failed: ${error.message}`);
    }

    if (!versions || versions.length === 0) {
      return NextResponse.json<VersionSearchResponse>({
        query: searchTerm,
        results: [],
        total: 0,
      });
    }

    // Map to VersionSearchResult
    const results: VersionSearchResult[] = versions.map((v: any) => {
      const { tone, style } = parseLabel(v.label);
      
      return {
        version_id: v.version_id || v.id,
        song_id: v.song_id,
        song_title: v.song_title || v.title_display || 'Untitled',
        artist_name: v.artist_name || null,
        tone,
        mixer: v.mixer || v.channel || null,
        style,
        pitch: v.key || v.pitch || null,
        tempo: v.tempo || null,
        storage_path: v.storage_path,
        duration_seconds: v.duration_seconds || null,
        play_url: buildPlayUrl(v.storage_path),
      };
    });

    console.log(`[search-versions] Found ${results.length} versions`);

    return NextResponse.json<VersionSearchResponse>({
      query: searchTerm,
      results,
      total: count || results.length,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    console.error('[search-versions] Error:', error);
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
```

**Verification:**
```bash
# Start dev server
npm run dev

# Test endpoint manually
curl "http://localhost:3000/api/songs/search-versions?q=vùng+lá+me+bay"

# Expected: JSON with flat list of versions
```

**Rollback:** `rm src/app/api/songs/search-versions/route.ts`

---

### **Phase 5: Create VersionCard Component (45 min)**
**Goal:** YouTube-like card with preview video + buttons

**File:** `src/components/VersionCard.tsx` (NEW)

**Full implementation:**
```typescript
'use client';

import { useState, useRef, useEffect } from 'react';
import type { VersionSearchResult } from '@/shared/types';

interface VersionCardProps {
  version: VersionSearchResult;
  onAddToQueue: (versionId: string) => void;
  isActive?: boolean; // For preview active state
}

export function VersionCard({ version, onAddToQueue, isActive = false }: VersionCardProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopPreview();
    };
  }, []);

  // Stop preview if another card becomes active
  useEffect(() => {
    if (!isActive && isPlaying) {
      stopPreview();
    }
  }, [isActive, isPlaying]);

  const startPreview = async () => {
    if (!videoRef.current || !version.play_url) return;

    try {
      setLoading(true);
      setError(false);
      
      const video = videoRef.current;
      
      // Set video source
      video.src = version.play_url;
      video.currentTime = 30; // Start at 30s
      video.muted = false; // User clicked, autoplay allowed
      video.volume = 0.5; // Reasonable volume
      
      // Attempt playback
      await video.play();
      setIsPlaying(true);
      setLoading(false);

      // Auto-stop after 10 seconds
      timeoutRef.current = setTimeout(() => {
        stopPreview();
      }, 10000);
    } catch (err) {
      console.error('[VersionCard] Preview failed:', err);
      setError(true);
      setLoading(false);
      setIsPlaying(false);
    }
  };

  const stopPreview = () => {
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
      videoRef.current.src = '';
    }
    
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    
    setIsPlaying(false);
    setLoading(false);
  };

  const handleAddToQueue = () => {
    stopPreview(); // Stop preview if playing
    onAddToQueue(version.version_id);
  };

  const handlePreviewClick = () => {
    if (isPlaying) {
      stopPreview();
    } else {
      startPreview();
    }
  };

  // Format duration MM:SS
  const formatDuration = (seconds: number | null): string => {
    if (!seconds) return '';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${String(secs).padStart(2, '0')}`;
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        background: '#fff',
        borderRadius: '12px',
        overflow: 'hidden',
        boxShadow: isActive ? '0 4px 16px rgba(33, 150, 243, 0.3)' : '0 2px 8px rgba(0,0,0,0.1)',
        transition: 'all 0.2s ease',
        border: isActive ? '2px solid #2196F3' : '1px solid #e0e0e0',
      }}
    >
      {/* Video Container (hidden, audio only) */}
      <video
        ref={videoRef}
        style={{ display: 'none' }}
        preload="metadata"
        playsInline
      />

      {/* Card Content */}
      <div style={{ padding: '16px' }}>
        {/* Title */}
        <h3
          style={{
            fontSize: '1rem',
            fontWeight: '600',
            margin: '0 0 8px 0',
            lineHeight: '1.4',
            color: '#0f0f0f',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {version.song_title}
        </h3>

        {/* Artist */}
        {version.artist_name && (
          <div
            style={{
              fontSize: '0.875rem',
              color: '#606060',
              marginBottom: '12px',
              display: '-webkit-box',
              WebkitLineClamp: 1,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {version.artist_name}
          </div>
        )}

        {/* Metadata Badges */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }}>
          {/* Tone */}
          {version.tone && (
            <span
              style={{
                fontSize: '0.75rem',
                padding: '4px 10px',
                background: version.tone === 'nam' ? '#E3F2FD' : '#FCE4EC',
                color: version.tone === 'nam' ? '#1976D2' : '#C2185B',
                borderRadius: '16px',
                fontWeight: '600',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              {version.tone === 'nam' ? '👨 Male' : '👩 Female'}
            </span>
          )}

          {/* Mixer/Channel */}
          {version.mixer && (
            <span
              style={{
                fontSize: '0.75rem',
                padding: '4px 10px',
                background: '#F5F5F5',
                color: '#424242',
                borderRadius: '16px',
                fontWeight: '500',
              }}
            >
              🎤 {version.mixer}
            </span>
          )}

          {/* Style */}
          {version.style && (
            <span
              style={{
                fontSize: '0.75rem',
                padding: '4px 10px',
                background: '#FFF3E0',
                color: '#E65100',
                borderRadius: '16px',
                fontWeight: '500',
              }}
            >
              🎵 {version.style.toUpperCase()}
            </span>
          )}

          {/* Pitch */}
          {version.pitch && (
            <span
              style={{
                fontSize: '0.75rem',
                padding: '4px 10px',
                background: '#E8F5E9',
                color: '#2E7D32',
                borderRadius: '16px',
                fontWeight: '500',
              }}
            >
              🎹 {version.pitch}
            </span>
          )}

          {/* Duration */}
          {version.duration_seconds && (
            <span
              style={{
                fontSize: '0.75rem',
                padding: '4px 10px',
                background: '#EDE7F6',
                color: '#512DA8',
                borderRadius: '16px',
                fontWeight: '500',
              }}
            >
              ⏱️ {formatDuration(version.duration_seconds)}
            </span>
          )}
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '8px' }}>
          {/* Preview Button */}
          <button
            onClick={handlePreviewClick}
            disabled={loading || error}
            style={{
              flex: 1,
              padding: '12px',
              background: isPlaying ? '#FF5252' : (loading ? '#BDBDBD' : '#2196F3'),
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontWeight: '600',
              fontSize: '0.875rem',
              cursor: loading ? 'wait' : (error ? 'not-allowed' : 'pointer'),
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              transition: 'all 0.2s',
              opacity: error ? 0.5 : 1,
            }}
          >
            {loading ? '⏳ Loading...' : isPlaying ? '⏸️ Stop' : '▶️ Preview'}
          </button>

          {/* Add to Queue Button */}
          <button
            onClick={handleAddToQueue}
            style={{
              flex: 1,
              padding: '12px',
              background: 'linear-gradient(135deg, #4CAF50 0%, #45A049 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontWeight: '600',
              fontSize: '0.875rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              transition: 'all 0.2s',
            }}
          >
            ➕ Add to Queue
          </button>
        </div>

        {/* Error State */}
        {error && (
          <div
            style={{
              marginTop: '8px',
              padding: '8px',
              background: '#FFEBEE',
              color: '#C62828',
              borderRadius: '6px',
              fontSize: '0.75rem',
              textAlign: 'center',
            }}
          >
            Preview failed. Try adding to queue instead.
          </div>
        )}
      </div>
    </div>
  );
}
```

**Verification:**
```bash
npm run build
# Should compile with no errors
```

**Rollback:** `rm src/components/VersionCard.tsx`

---

### **Phase 6: Create Preview Manager Context (20 min)**
**Goal:** Ensure only one preview plays at a time

**File:** `src/contexts/PreviewContext.tsx` (NEW)

```typescript
'use client';

import { createContext, useContext, useState, ReactNode } from 'react';

interface PreviewContextType {
  activePreviewId: string | null;
  setActivePreview: (id: string | null) => void;
}

const PreviewContext = createContext<PreviewContextType>({
  activePreviewId: null,
  setActivePreview: () => {},
});

export function PreviewProvider({ children }: { children: ReactNode }) {
  const [activePreviewId, setActivePreviewId] = useState<string | null>(null);

  return (
    <PreviewContext.Provider value={{ activePreviewId, setActivePreview: setActivePreviewId }}>
      {children}
    </PreviewContext.Provider>
  );
}

export const usePreview = () => useContext(PreviewContext);
```

**File:** `src/app/layout.tsx` (MODIFY)

```typescript
// ADD import
import { PreviewProvider } from '@/contexts/PreviewContext';

// WRAP children in layout
<PreviewProvider>
  {children}
</PreviewProvider>
```

**Verification:**
```bash
npm run build
```

**Rollback:** 
```bash
rm src/contexts/PreviewContext.tsx
git checkout src/app/layout.tsx
```

---

### **Phase 7: Integrate into Room Page (60 min)**
**Goal:** Replace current search with YouTube-like version search

**File:** `src/app/room/[code]/page.tsx` (MAJOR MODIFY)

**Changes:**

1. **Update imports:**
```typescript
// ADD
import { VersionCard } from '@/components/VersionCard';
import { usePreview } from '@/contexts/PreviewContext';
import type { VersionSearchResult, VersionSearchResponse } from '@/shared/types';
```

2. **Update state (around line 544):**
```typescript
// REPLACE searchResults state
// OLD: const [searchResults, setSearchResults] = useState<SongGroupResult[]>([]);
// NEW:
const [searchResults, setSearchResults] = useState<VersionSearchResult[]>([]);
const { activePreviewId, setActivePreview } = usePreview();
```

3. **Update search function (around line 735):**
```typescript
// REPLACE handleSearch function
const handleSearch = useCallback(
  debounce(async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    try {
      // NEW API endpoint
      const response = await fetch(`/api/songs/search-versions?q=${encodeURIComponent(query)}&limit=50`);
      
      if (!response.ok) {
        throw new Error('Search failed');
      }

      const data: VersionSearchResponse = await response.json();
      console.log('Search results:', data.results.length);
      setSearchResults(data.results);
    } catch (err: any) {
      console.error('Search error:', err);
      showError(err.message || 'Search failed');
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, 300),
  []
);
```

4. **Update add to queue handler:**
```typescript
// ADD new function (around line 900)
const handleAddVersionToQueue = async (versionId: string) => {
  if (!room || !user) return;

  setAddingToQueue(true);
  try {
    await api.addToQueue(room.id, user.id, versionId);
    success('Song added to queue!');
    await refreshRoomState(room.id);
  } catch (err: any) {
    console.error('Failed to add song:', err);
    showError(err.message || 'Failed to add song');
  } finally {
    setAddingToQueue(false);
  }
};
```

5. **Replace search results rendering (around line 1040):**
```typescript
{/* REPLACE entire searchResults.map section */}
{/* OLD: Group-based cards with version selector */}

{/* NEW: YouTube-like version cards */}
<div
  style={{
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
    gap: '16px',
    padding: '16px 0',
  }}
>
  {searchResults.map((version) => (
    <VersionCard
      key={version.version_id}
      version={version}
      onAddToQueue={handleAddVersionToQueue}
      isActive={activePreviewId === version.version_id}
    />
  ))}
</div>

{/* Empty states */}
{searchResults.length === 0 && searchQuery && !searching && (
  <div style={{ textAlign: 'center', padding: '3rem', color: '#666' }}>
    <p style={{ fontSize: '1.2rem', marginBottom: '0.5rem' }}>😕 No versions found</p>
    <p style={{ fontSize: '0.9rem' }}>Try a different search term</p>
  </div>
)}

{searchResults.length === 0 && !searchQuery && !searching && (
  <div style={{ textAlign: 'center', padding: '3rem', color: '#666' }}>
    <p style={{ fontSize: '1.2rem', marginBottom: '0.5rem' }}>🎤 Search for songs</p>
    <p style={{ fontSize: '0.9rem' }}>Start typing to find karaoke tracks</p>
  </div>
)}
```

6. **Remove version selector modal** (DELETE entire VersionSelector component and related state)

**Verification:**
```bash
npm run dev
# Test search functionality manually
```

**Rollback:** `git checkout src/app/room/[code]/page.tsx`

---

### **Phase 8: Update API Client (if needed) (10 min)**
**Goal:** Ensure `api.addToQueue` accepts `versionId`

**File:** `src/lib/api.ts`

**Verify/Update `addToQueue` function:**
```typescript
async addToQueue(roomId: string, userId: string, versionId: string) {
  const response = await fetch('/api/queue/add', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ room_id: roomId, user_id: userId, version_id: versionId }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to add to queue');
  }

  return response.json();
}
```

**Verification:**
```bash
npm run build
```

**Rollback:** `git checkout src/lib/api.ts`

---

### **Phase 9: Testing Checklist (30 min)**

#### **9.1 API Testing**
```bash
# Test search endpoint
curl "http://localhost:3000/api/songs/search-versions?q=test"

# Expected: JSON with flat version list
# Verify: tone, mixer, style, play_url present
```

#### **9.2 Frontend Testing**
- [ ] Search returns flat list of versions (no grouping)
- [ ] Each card shows: title, artist, tone, mixer, style, pitch, duration
- [ ] "Preview" button loads and plays audio for 10s
- [ ] "Add to Queue" button adds version to queue
- [ ] Only one preview plays at a time
- [ ] Preview stops when clicking another preview
- [ ] Preview stops after 10 seconds automatically
- [ ] Mobile responsive (cards stack on narrow screens)
- [ ] No console errors

#### **9.3 Performance Testing**
- [ ] Search responds in <500ms
- [ ] No memory leaks after 20+ previews
- [ ] Smooth scrolling with 50+ results
- [ ] Preview starts in <1s on average connection

---

### **Phase 10: Documentation Update**

This file serves as the primary documentation for the YouTube-like search implementation.

**Additional files:**
- API contract in `Documentation/Songs_API_Contract.md` (update to include new endpoint)
- Testing results in `Documentation/SEARCH_REVAMP_TESTING.md` (create after Phase 9)

---

### **Phase 11: Final Verification (15 min)**

**Pre-commit checklist:**
- [ ] `npm run build` succeeds
- [ ] All tests pass (Phase 9)
- [ ] No TypeScript errors
- [ ] No linter errors
- [ ] Rules policy complied (no hardcoded mixers)
- [ ] Rollback tested (`git checkout main` works)

**Build verification:**
```bash
npm run build
npm run start  # Test production build
```

---

## 🚦 Approval & Deployment

### Before Proceeding

**Confirm:**
1. ✅ Plan structure is clear
2. ✅ Rollback strategy is acceptable
3. ✅ Rules policy compliance is verified
4. ✅ No caching will be used
5. ✅ Step-by-step approach is approved

**Estimated total time:** ~4 hours (including testing)

**Git commits:** NONE until final testing approved

### Deployment Steps

1. Complete all phases 1-11
2. Run full testing checklist (Phase 9)
3. User approval for go-live
4. Commit changes with detailed message
5. Push to feature branch
6. Merge to main after final review

---

## 🔄 Rollback Procedures

### Quick Rollback (Development)
```bash
git checkout main
npm run dev
```

### Emergency Rollback (Production)
```bash
# Restore backup files
cp .backups/search-revamp/* src/app/api/songs/search/
cp .backups/search-revamp/* src/app/room/[code]/
cp .backups/search-revamp/* src/shared/

# Remove new files
rm src/app/api/songs/search-versions/route.ts
rm src/components/VersionCard.tsx
rm src/contexts/PreviewContext.tsx

# Rebuild and restart
npm run build
npm run start
```

---

## 📊 Success Metrics

**Phase 1 delivers:**
- ✅ Users immediately hear the difference
- ✅ Fewer wrong queue selections
- ✅ Faster decision-making
- ✅ YouTube-like browsing feel
- ✅ No DB changes
- ✅ No infra risk

**Telemetry to track (client-side only):**
- `preview_attempted` - Button clicks
- `preview_started` - Successful playback
- `preview_duration_ms` - How long users listen
- `queue_added_after_preview` - Conversion rate

---

## 🛡️ Safety Guardrails

1. **Only one preview at a time** - Starting a new preview auto-stops previous
2. **Timeout fail-safe** - If preview doesn't start in 1s → abort silently
3. **User feedback** - Show loading spinner while buffering
4. **No error popups** - Graceful degradation (show error in card, allow queue add)
5. **Memory management** - Video element destroyed after preview stops

---

## 📝 Notes

- All mixer/channel names dynamically loaded from `Controller/channelSources.md`
- No database schema changes
- Read-only operations on `kara_song_versions_detail_view`
- Browser handles byte-range requests (no caching needed)
- Works with existing media server setup (must support `Accept-Ranges: bytes`)

---

## 🔍 Media Server Verification

**Before starting, verify media server supports byte-range requests:**

```bash
curl -I https://media.yourdomain/videos/foo.mp4
```

**Must include:**
```
Accept-Ranges: bytes
```

If present → preview works. If missing → seek to 30s will fail (fallback to 0s).
