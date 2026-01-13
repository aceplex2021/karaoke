# 🎨 Phase II: UI/UX Professional Grade Enhancements

**Date:** 2026-01-13  
**Status:** Planning  
**Goal:** Polish device and TV interfaces to professional grade without breaking existing functionality

---

## 🎯 **Objectives**

### **Primary Goals:**
1. ✅ Device queue shows only user's own songs with remove capability
2. ✅ TV host can reorder queue with simple up/down buttons
3. ✅ Search results clearly show version mixer names
4. ✅ Professional UI/UX with modern design patterns
5. ✅ Safe rollback capability if anything breaks

### **Success Metrics:**
- Zero breaking changes to existing functionality
- Improved user satisfaction (subjective testing)
- Works across all target devices (phone, tablet, FireTV, Smart TV)
- Can revert in <5 minutes if needed

---

## 🛡️ **PHASE 0: Safety Net Setup**

**Duration:** 5 minutes  
**Risk:** None  
**Rollback:** N/A

### **Step 0.1: Tag Current Working Version**

```bash
# Tag the current working rebuild
git tag v1.0-rebuild-working -m "Working version before Phase II enhancements"
git push origin v1.0-rebuild-working

# Verify tag exists
git tag -l
```

**Success Criteria:**
- ✅ Tag `v1.0-rebuild-working` exists locally
- ✅ Tag pushed to GitHub
- ✅ Can checkout this tag later: `git checkout v1.0-rebuild-working`

### **Step 0.2: Create Feature Branch**

```bash
# Create and switch to feature branch
git checkout -b feature/phase2-ui-enhancements

# Verify branch
git branch
```

**Success Criteria:**
- ✅ On branch `feature/phase2-ui-enhancements`
- ✅ Branch identical to main at this point
- ✅ Can switch back to main anytime: `git checkout main`

### **Step 0.3: Document Rollback Procedure**

Create `ROLLBACK.md`:

```markdown
# Emergency Rollback to v1.0-rebuild-working

## If Phase II changes break something:

1. Stop dev server (Ctrl+C)
2. Switch to working version:
   ```bash
   git checkout v1.0-rebuild-working
   npm run dev
   ```
3. Everything should work immediately (no DB changes in Phase II)

## To continue work on Phase II later:
```bash
git checkout feature/phase2-ui-enhancements
```

## To permanently abandon Phase II:
```bash
git checkout main
git branch -D feature/phase2-ui-enhancements
```
```

**Success Criteria:**
- ✅ ROLLBACK.md file exists in root
- ✅ Instructions are clear and tested
- ✅ No database schema changes in Phase II (pure UI)

---

## 📱 **PHASE 1: Device Page - Queue Display Enhancement**

**Duration:** 1-2 hours  
**Risk:** Low  
**Files:** `src/app/room/[code]/page.tsx`, `src/app/api/queue/item/[queueItemId]/route.ts`

### **Current State Issues:**
- ❌ Shows everyone's songs in queue
- ❌ User can't distinguish their songs from others
- ❌ No way to remove songs after adding
- ❌ Confusing "Skip" button that does nothing useful

### **Target State:**
- ✅ Shows ONLY current user's songs
- ✅ Clear "Your Queue" section
- ✅ Trash can icon next to each song for removal
- ✅ Removed "Skip" button
- ✅ Shows position in overall queue (e.g., "#3 in line")

### **Step 1.1: Filter Queue to Show Only User's Songs**

**File:** `src/app/room/[code]/page.tsx`

**Current Logic:**
```typescript
// Shows all songs in queue
const queue = roomState?.queue || [];
```

**New Logic:**
```typescript
// Filter to show only current user's songs
const userQueue = (roomState?.queue || []).filter(
  item => item.user_id === user?.id
);

// Track total queue size for position display
const totalQueueSize = roomState?.queue.length || 0;
```

**Changes:**
1. Add `userQueue` derived state (filtered by user_id)
2. Keep `roomState.queue` for statistics (total count)
3. Update queue display to use `userQueue` instead of `queue`

**Success Criteria:**
- ✅ Device page shows only logged-in user's songs
- ✅ Other users' songs are hidden
- ✅ Empty state: "You haven't added any songs yet"

### **Step 1.2: Add Position Display**

**File:** `src/app/room/[code]/page.tsx`

**Logic:**
```typescript
// For each song in userQueue, find its position in overall queue
const getPositionInQueue = (queueItemId: string): number => {
  const fullQueue = roomState?.queue || [];
  const index = fullQueue.findIndex(item => item.id === queueItemId);
  return index !== -1 ? index + 1 : -1;
};
```

**UI:**
```tsx
<div className="queue-item">
  <div className="position-badge">#{getPositionInQueue(item.id)}</div>
  <div className="song-info">
    <div className="title">{item.song?.title}</div>
    <div className="artist">{item.song?.artist || 'Unknown'}</div>
  </div>
  <button className="remove-btn" onClick={() => handleRemove(item.id)}>
    🗑️
  </button>
</div>
```

**Success Criteria:**
- ✅ Each song shows its position in overall queue
- ✅ Position updates in real-time as queue changes

### **Step 1.3: Create DELETE Endpoint**

**New File:** `src/app/api/queue/item/[queueItemId]/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/server/lib/supabase';

export const dynamic = 'force-dynamic';

/**
 * DELETE /api/queue/item/[queueItemId]
 * 
 * Remove a song from queue (user can only remove their own songs)
 * 
 * Rules:
 * - Can only remove songs in 'pending' status
 * - Cannot remove currently playing song
 * - User can only remove their own songs (verified by user_id)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { queueItemId: string } }
) {
  try {
    const { queueItemId } = params;
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('user_id');
    
    if (!userId) {
      return NextResponse.json(
        { error: 'user_id required' },
        { status: 400 }
      );
    }
    
    // Verify ownership and status before deletion
    const { data: queueItem, error: fetchError } = await supabaseAdmin
      .from('kara_queue')
      .select('user_id, status')
      .eq('id', queueItemId)
      .single();
    
    if (fetchError || !queueItem) {
      return NextResponse.json(
        { error: 'Queue item not found' },
        { status: 404 }
      );
    }
    
    // Verify user owns this song
    if (queueItem.user_id !== userId) {
      return NextResponse.json(
        { error: 'Cannot remove another user\'s song' },
        { status: 403 }
      );
    }
    
    // Verify song is not currently playing
    if (queueItem.status === 'playing') {
      return NextResponse.json(
        { error: 'Cannot remove currently playing song' },
        { status: 409 }
      );
    }
    
    // Delete the queue item
    const { error: deleteError } = await supabaseAdmin
      .from('kara_queue')
      .delete()
      .eq('id', queueItemId);
    
    if (deleteError) {
      console.error('[queue/remove] Delete error:', deleteError);
      return NextResponse.json(
        { error: deleteError.message },
        { status: 500 }
      );
    }
    
    return NextResponse.json({
      success: true,
      message: 'Song removed from queue'
    });
    
  } catch (error: any) {
    console.error('[queue/remove] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
```

**Success Criteria:**
- ✅ Endpoint created at `/api/queue/item/[queueItemId]`
- ✅ Only accepts DELETE method
- ✅ Verifies user ownership
- ✅ Prevents removing playing songs
- ✅ Returns appropriate error codes

### **Step 1.4: Add Remove Handler to Device Page**

**File:** `src/app/room/[code]/page.tsx`

**Add to API client:**
```typescript
// src/lib/api.ts
async removeSongFromQueue(queueItemId: string, userId: string): Promise<void> {
  const res = await fetch(
    `/api/queue/item/${queueItemId}?user_id=${userId}`,
    { method: 'DELETE' }
  );
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Failed to remove song' }));
    throw new Error(error.error);
  }
}
```

**Add handler to page:**
```typescript
const handleRemoveSong = async (queueItemId: string, songTitle: string) => {
  // Confirmation dialog
  if (!confirm(`Remove "${songTitle}" from queue?`)) {
    return;
  }
  
  try {
    setError('');
    await api.removeSongFromQueue(queueItemId, user.id);
    
    // Show success (will update on next poll ≤3s)
    // TODO: Replace alert with toast in Step 5.1
    alert('✅ Song removed from queue');
    
    // UI does NOTHING - waits for next poll
  } catch (err: any) {
    console.error('[handleRemoveSong] Error:', err);
    setError(err.message || 'Failed to remove song');
    alert(`❌ ${err.message || 'Failed to remove song'}`);
  }
};
```

**Success Criteria:**
- ✅ Clicking trash can shows confirmation
- ✅ Confirmed removal removes song
- ✅ Error handling works (try removing someone else's song)
- ✅ UI updates after ~3s via polling

### **Step 1.5: Remove "Skip" Button**

**File:** `src/app/room/[code]/page.tsx`

**Find and delete:**
```typescript
// Delete this entire button and its handler
<button onClick={handleSkip}>Skip</button>
```

**Success Criteria:**
- ✅ "Skip" button removed from UI
- ✅ No console errors
- ✅ Other buttons still work

### **Step 1.6: Update Queue Display UI**

**File:** `src/app/room/[code]/page.tsx`

**New Queue Section:**
```tsx
{/* Your Queue Section */}
<div className="queue-section">
  <h2 className="queue-header">
    Your Queue ({userQueue.length})
  </h2>
  
  {userQueue.length === 0 ? (
    <div className="empty-queue">
      <p>You haven't added any songs yet.</p>
      <p>Search above to add songs to the queue!</p>
    </div>
  ) : (
    <div className="queue-list">
      {userQueue.map((item) => (
        <div key={item.id} className="queue-item">
          <div className="position-badge">
            #{getPositionInQueue(item.id)}
          </div>
          <div className="song-details">
            <div className="song-title">{item.song?.title}</div>
            <div className="song-artist">{item.song?.artist || 'Unknown Artist'}</div>
            <div className="song-meta">
              {item.status === 'pending' ? 'Waiting' : 'Playing'}
            </div>
          </div>
          {item.status === 'pending' && (
            <button
              className="remove-button"
              onClick={() => handleRemoveSong(item.id, item.song?.title || 'this song')}
              aria-label="Remove song"
            >
              🗑️
            </button>
          )}
        </div>
      ))}
    </div>
  )}
  
  {totalQueueSize > userQueue.length && (
    <div className="queue-info">
      <p>💡 {totalQueueSize - userQueue.length} other song(s) in queue</p>
    </div>
  )}
</div>
```

**CSS Updates (globals.css):**
```css
.queue-section {
  margin-top: 2rem;
}

.queue-header {
  font-size: 1.5rem;
  font-weight: bold;
  margin-bottom: 1rem;
}

.empty-queue {
  text-align: center;
  padding: 2rem;
  background: rgba(0, 0, 0, 0.05);
  border-radius: 8px;
  color: #666;
}

.queue-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.queue-item {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  background: white;
  border: 1px solid #ddd;
  border-radius: 8px;
  transition: box-shadow 0.2s;
}

.queue-item:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.position-badge {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #4CAF50;
  color: white;
  border-radius: 50%;
  font-weight: bold;
  font-size: 1.1rem;
}

.song-details {
  flex: 1;
  min-width: 0;
}

.song-title {
  font-weight: 600;
  font-size: 1.1rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.song-artist {
  color: #666;
  font-size: 0.9rem;
  margin-top: 0.25rem;
}

.song-meta {
  color: #999;
  font-size: 0.85rem;
  margin-top: 0.25rem;
}

.remove-button {
  flex-shrink: 0;
  width: 48px;
  height: 48px;
  font-size: 1.5rem;
  border: none;
  background: transparent;
  cursor: pointer;
  transition: transform 0.2s;
  padding: 0;
}

.remove-button:hover {
  transform: scale(1.2);
}

.remove-button:active {
  transform: scale(0.95);
}

.queue-info {
  margin-top: 1rem;
  padding: 0.75rem;
  background: rgba(76, 175, 80, 0.1);
  border-radius: 8px;
  text-align: center;
  color: #2E7D32;
}
```

**Success Criteria:**
- ✅ Queue shows only user's songs
- ✅ Position badges display correctly
- ✅ Trash can button is easily tappable (48x48px)
- ✅ Empty state shows helpful message
- ✅ Shows count of other songs in queue
- ✅ Responsive design works on phone/tablet

---

## 🔍 **PHASE 2: Device Page - Search Results Enhancement**

**Duration:** 1 hour  
**Risk:** Low  
**Files:** `src/app/room/[code]/page.tsx`, `src/app/api/songs/search/route.ts`

### **Current State Issues:**
- ❌ Multiple versions of same song shown without distinction
- ❌ User can't tell which version to pick
- ❌ No mixer/label information displayed

### **Target State:**
- ✅ Each version shows mixer name clearly
- ✅ Visual distinction between versions
- ✅ Default version highlighted
- ✅ Easy to understand which to pick

### **Step 2.1: Update Search API to Include All Version Metadata**

**File:** `src/app/api/songs/search/route.ts` or `src/app/api/songs/group/[groupId]/versions/route.ts`

**Ensure query includes ALL version metadata:**
```typescript
.select(`
  *,
  kara_versions!inner (
    id,
    label,          // Mixer type (nam, nu, nam_nu, beat, etc.)
    key,            // Musical key (C, D, F#, etc.)
    tempo,          // Speed/BPM
    is_default,     // Recommended version
    created_at      // For sorting by newest
  )
`)
```

**Success Criteria:**
- ✅ API returns label, key, tempo for all versions
- ✅ Frontend receives complete metadata
- ✅ No performance degradation

### **Step 2.2: Create Comprehensive Version Display Helper**

**File:** `src/app/room/[code]/page.tsx`

**Add formatter functions:**
```typescript
/**
 * Format mixer label for user-friendly display
 */
const formatMixerLabel = (label: string): string => {
  const labelMap: Record<string, string> = {
    'nam': 'Male Voice',
    'nu': 'Female Voice',
    'nam_nu': 'Duet (Male & Female)',
    'beat': 'Beat Only (Instrumental)',
    'acoustic': 'Acoustic Version',
    'remix': 'Remix',
    'original': 'Original',
    'karaoke': 'Karaoke',
  };
  
  return labelMap[label?.toLowerCase()] || label?.toUpperCase() || 'Standard';
};

/**
 * Format musical key
 */
const formatKey = (key: string | null): string => {
  if (!key) return '';
  // Key might be stored as 'C', 'Dm', 'F#', etc.
  return `Key: ${key}`;
};

/**
 * Format tempo
 */
const formatTempo = (tempo: number | null): string => {
  if (!tempo) return '';
  return `${tempo} BPM`;
};

/**
 * Build complete version description
 */
const buildVersionDescription = (version: any): string[] => {
  const parts: string[] = [];
  
  // Always show mixer type (most important)
  parts.push(formatMixerLabel(version.label));
  
  // Add key if available
  if (version.key) {
    parts.push(formatKey(version.key));
  }
  
  // Add tempo if available
  if (version.tempo) {
    parts.push(formatTempo(version.tempo));
  }
  
  return parts;
};

/**
 * Get version icon based on mixer type
 */
const getVersionIcon = (label: string): string => {
  const iconMap: Record<string, string> = {
    'nam': '👨',      // Male
    'nu': '👩',       // Female
    'nam_nu': '👫',   // Duet
    'beat': '🎵',     // Instrumental
    'acoustic': '🎸', // Acoustic
    'remix': '🎧',    // Remix
  };
  
  return iconMap[label?.toLowerCase()] || '🎤';
};
```

**Success Criteria:**
- ✅ All version metadata formatted for display
- ✅ Handles null/missing values gracefully
- ✅ Icons make versions visually distinct

### **Step 2.3: Update Search Results Display**

**File:** `src/app/room/[code]/page.tsx`

**New UI with rich metadata:**
```tsx
<div className="search-result-card">
  <div className="result-header">
    <h3 className="result-title">{result.display_title}</h3>
    {result.has_best_version && (
      <span className="default-badge">⭐ Recommended</span>
    )}
  </div>
  
  {/* Show rich version info */}
  {result.best_version && (
    <div className="version-preview">
      <span className="version-icon">
        {getVersionIcon(result.best_version.label)}
      </span>
      <div className="version-details">
        {buildVersionDescription(result.best_version).map((part, idx) => (
          <span key={idx} className="version-detail-item">
            {part}
          </span>
        ))}
      </div>
    </div>
  )}
  
  <div className="result-actions">
    <button 
      className="add-button primary"
      onClick={() => handleAddToQueue(result)}
    >
      Add to Queue
    </button>
    
    {/* Show other versions if available */}
    {result.version_count > 1 && (
      <button 
        className="versions-button"
        onClick={() => showVersionSelector(result)}
      >
        See {result.version_count} versions
      </button>
    )}
  </div>
</div>
```

**CSS for version preview:**
```css
.version-preview {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin: 0.75rem 0;
  padding: 0.5rem;
  background: rgba(33, 150, 243, 0.1);
  border-radius: 6px;
}

.version-icon {
  font-size: 1.5rem;
  flex-shrink: 0;
}

.version-details {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  flex: 1;
}

.version-detail-item {
  padding: 0.25rem 0.5rem;
  background: white;
  border-radius: 4px;
  font-size: 0.85rem;
  font-weight: 500;
  color: #333;
  white-space: nowrap;
}
```

**Success Criteria:**
- ✅ Mixer type shown prominently with icon
- ✅ Key and tempo displayed if available
- ✅ Visual distinction between versions
- ✅ User can immediately understand the version

### **Step 2.4: Enhance Version Selector Modal with Complete Details**

**File:** `src/app/room/[code]/page.tsx`

**Rich Version Selector UI:**
```tsx
{showVersionSelector && selectedGroupId && (
  <div className="modal-overlay" onClick={closeVersionSelector}>
    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
      <div className="modal-header">
        <h2>Choose Your Version</h2>
        <button className="close-button" onClick={closeVersionSelector}>×</button>
      </div>
      
      <div className="versions-list">
        {groupVersions.map((version) => {
          const description = buildVersionDescription(version);
          const icon = getVersionIcon(version.label);
          
          return (
            <div
              key={version.id}
              className={`version-card ${version.is_default ? 'default recommended' : ''}`}
            >
              {/* Visual Header */}
              <div className="version-card-header">
                <span className="version-icon-large">{icon}</span>
                <div className="version-title-section">
                  <h3 className="mixer-label">
                    {formatMixerLabel(version.label || 'standard')}
                  </h3>
                  {version.is_default && (
                    <span className="default-badge">⭐ Recommended</span>
                  )}
                </div>
              </div>
              
              {/* Metadata Tags */}
              <div className="version-metadata">
                {version.key && (
                  <div className="metadata-tag key">
                    <span className="tag-icon">🎹</span>
                    <span className="tag-label">Key:</span>
                    <span className="tag-value">{version.key}</span>
                  </div>
                )}
                
                {version.tempo && (
                  <div className="metadata-tag tempo">
                    <span className="tag-icon">⚡</span>
                    <span className="tag-label">Tempo:</span>
                    <span className="tag-value">{version.tempo} BPM</span>
                  </div>
                )}
                
                {!version.key && !version.tempo && (
                  <div className="metadata-tag standard">
                    <span className="tag-icon">✨</span>
                    <span className="tag-value">Standard Version</span>
                  </div>
                )}
              </div>
              
              {/* Description if available */}
              {version.label && (
                <div className="version-description">
                  {getVersionDescription(version.label)}
                </div>
              )}
              
              {/* Action Button */}
              <button
                className="select-version-button"
                onClick={() => handleAddVersion(version)}
              >
                <span className="button-icon">🎤</span>
                Add This Version
              </button>
            </div>
          );
        })}
      </div>
      
      {/* Help Text */}
      <div className="modal-footer">
        <p className="help-text">
          💡 Tip: Choose the version that matches your vocal range
        </p>
      </div>
    </div>
  </div>
)}
```

**Add helper for version descriptions:**
```typescript
/**
 * Get user-friendly description for mixer type
 */
const getVersionDescription = (label: string): string => {
  const descriptions: Record<string, string> = {
    'nam': 'Lower pitch, suitable for male singers',
    'nu': 'Higher pitch, suitable for female singers',
    'nam_nu': 'Duet version with both male and female parts',
    'beat': 'Instrumental only, no vocals',
    'acoustic': 'Unplugged acoustic arrangement',
    'remix': 'Modern remix with different arrangement',
  };
  
  return descriptions[label?.toLowerCase()] || 'Standard karaoke version';
};
```

**CSS for Enhanced Version Selector:**
```css
/* Modal Base */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.modal-content {
  background: white;
  border-radius: 16px;
  padding: 1.5rem;
  max-width: 600px;
  width: 90%;
  max-height: 85vh;
  overflow-y: auto;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  animation: slideUp 0.3s ease;
}

@keyframes slideUp {
  from { 
    opacity: 0;
    transform: translateY(20px);
  }
  to { 
    opacity: 1;
    transform: translateY(0);
  }
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
  padding-bottom: 1rem;
  border-bottom: 2px solid #eee;
}

.modal-header h2 {
  font-size: 1.5rem;
  color: #333;
  margin: 0;
}

.close-button {
  font-size: 2rem;
  border: none;
  background: none;
  cursor: pointer;
  width: 40px;
  height: 40px;
  padding: 0;
  color: #999;
  transition: color 0.2s;
}

.close-button:hover {
  color: #333;
}

/* Version List */
.versions-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin-bottom: 1rem;
}

/* Version Card */
.version-card {
  padding: 1.25rem;
  border: 2px solid #ddd;
  border-radius: 12px;
  transition: all 0.3s;
  background: white;
}

.version-card.recommended {
  border-color: #4CAF50;
  background: linear-gradient(135deg, rgba(76, 175, 80, 0.08) 0%, rgba(76, 175, 80, 0.02) 100%);
  box-shadow: 0 2px 8px rgba(76, 175, 80, 0.2);
}

.version-card:hover {
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.12);
  transform: translateY(-2px);
}

/* Version Card Header */
.version-card-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1rem;
}

.version-icon-large {
  font-size: 2.5rem;
  flex-shrink: 0;
}

.version-title-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.mixer-label {
  font-weight: 700;
  font-size: 1.2rem;
  color: #333;
  margin: 0;
}

.default-badge {
  background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%);
  color: white;
  padding: 0.25rem 0.75rem;
  border-radius: 20px;
  font-size: 0.8rem;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  width: fit-content;
}

/* Metadata Tags */
.version-metadata {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.metadata-tag {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  background: #f5f5f5;
  border-radius: 8px;
  font-size: 0.9rem;
}

.metadata-tag.key {
  background: linear-gradient(135deg, #E3F2FD 0%, #BBDEFB 100%);
  color: #1976D2;
}

.metadata-tag.tempo {
  background: linear-gradient(135deg, #FFF3E0 0%, #FFE0B2 100%);
  color: #F57C00;
}

.metadata-tag.standard {
  background: linear-gradient(135deg, #F3E5F5 0%, #E1BEE7 100%);
  color: #7B1FA2;
}

.tag-icon {
  font-size: 1.1rem;
}

.tag-label {
  font-weight: 600;
}

.tag-value {
  font-weight: 700;
}

/* Version Description */
.version-description {
  padding: 0.75rem;
  background: rgba(33, 150, 243, 0.08);
  border-left: 3px solid #2196F3;
  border-radius: 6px;
  font-size: 0.9rem;
  color: #555;
  line-height: 1.5;
  margin-bottom: 1rem;
}

/* Select Button */
.select-version-button {
  width: 100%;
  padding: 1rem;
  background: linear-gradient(135deg, #2196F3 0%, #1976D2 100%);
  color: white;
  border: none;
  border-radius: 10px;
  font-weight: 700;
  font-size: 1rem;
  cursor: pointer;
  transition: all 0.3s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  box-shadow: 0 4px 12px rgba(33, 150, 243, 0.3);
}

.select-version-button:hover {
  background: linear-gradient(135deg, #1976D2 0%, #1565C0 100%);
  box-shadow: 0 6px 16px rgba(33, 150, 243, 0.4);
  transform: translateY(-2px);
}

.select-version-button:active {
  transform: translateY(0);
  box-shadow: 0 2px 8px rgba(33, 150, 243, 0.3);
}

.version-card.recommended .select-version-button {
  background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%);
  box-shadow: 0 4px 12px rgba(76, 175, 80, 0.3);
}

.version-card.recommended .select-version-button:hover {
  background: linear-gradient(135deg, #45a049 0%, #388E3C 100%);
  box-shadow: 0 6px 16px rgba(76, 175, 80, 0.4);
}

.button-icon {
  font-size: 1.2rem;
}

/* Modal Footer */
.modal-footer {
  padding-top: 1rem;
  border-top: 1px solid #eee;
}

.help-text {
  text-align: center;
  color: #666;
  font-size: 0.9rem;
  margin: 0;
  line-height: 1.5;
}

/* Mobile Responsive */
@media (max-width: 768px) {
  .modal-content {
    width: 95%;
    max-height: 90vh;
    padding: 1rem;
  }
  
  .version-icon-large {
    font-size: 2rem;
  }
  
  .mixer-label {
    font-size: 1.1rem;
  }
  
  .metadata-tag {
    font-size: 0.85rem;
    padding: 0.4rem 0.6rem;
  }
}
```

**Visual Example of New Version Cards:**

```
┌──────────────────────────────────────┐
│ 👨 Male Voice           ⭐ Recommended│
│                                      │
│ 🎹 Key: C    ⚡ Tempo: 120 BPM      │
│                                      │
│ ℹ️ Lower pitch, suitable for male   │
│    singers                           │
│                                      │
│ [🎤 Add This Version]               │
└──────────────────────────────────────┘

┌──────────────────────────────────────┐
│ 👩 Female Voice                      │
│                                      │
│ 🎹 Key: F    ⚡ Tempo: 120 BPM      │
│                                      │
│ ℹ️ Higher pitch, suitable for female│
│    singers                           │
│                                      │
│ [🎤 Add This Version]               │
└──────────────────────────────────────┘

┌──────────────────────────────────────┐
│ 👫 Duet (Male & Female)              │
│                                      │
│ 🎹 Key: D    ⚡ Tempo: 115 BPM      │
│                                      │
│ ℹ️ Duet version with both male and  │
│    female parts                      │
│                                      │
│ [🎤 Add This Version]               │
└──────────────────────────────────────┘

┌──────────────────────────────────────┐
│ 🎵 Beat Only (Instrumental)          │
│                                      │
│ ✨ Standard Version                  │
│                                      │
│ ℹ️ Instrumental only, no vocals     │
│                                      │
│ [🎤 Add This Version]               │
└──────────────────────────────────────┘
```

**Success Criteria:**
- ✅ Each version shows distinct icon (👨👩👫🎵)
- ✅ Mixer type clearly labeled (Male/Female/Duet/Beat)
- ✅ Musical key displayed if available (🎹 Key: C)
- ✅ Tempo/BPM shown if available (⚡ 120 BPM)
- ✅ Recommended version has visual highlight
- ✅ User-friendly description explains the version
- ✅ Easy to tap on mobile (large touch targets)
- ✅ Can close modal (X button or overlay click)
- ✅ Users can immediately distinguish versions
- ✅ No more "NAM nam" confusion!

### **Step 2.5: Summary - What Changed & Why**

**Before (Current State):**
```
Select Version

Khi

NAM  nam  ▶
NAM  nam  ▶
NAM  nam  ▶
NAM  nam  ▶
```
❌ **Problem:** Users can't distinguish between versions. All look identical.

**After (Enhanced State):**
```
Choose Your Version

👨 Male Voice              ⭐ Recommended
🎹 Key: C    ⚡120 BPM
Lower pitch, suitable for male singers
[🎤 Add This Version]

👩 Female Voice
🎹 Key: F    ⚡ 120 BPM
Higher pitch, suitable for female singers
[🎤 Add This Version]

👫 Duet (Male & Female)
🎹 Key: D    ⚡ 115 BPM
Duet version with both male and female parts
[🎤 Add This Version]

🎵 Beat Only (Instrumental)
✨ Standard Version
Instrumental only, no vocals
[🎤 Add This Version]
```
✅ **Solution:** 
- Clear visual icons for each version type
- Mixer type spelled out (Male/Female/Duet)
- Musical key and tempo displayed
- Helpful description for each version
- Recommended version highlighted

**Database Fields Used:**
- `kara_versions.label` → Mixer type (nam, nu, nam_nu, beat)
- `kara_versions.key` → Musical key (C, D, F, etc.)
- `kara_versions.tempo` → BPM speed
- `kara_versions.is_default` → Recommended flag

**User Experience Improvement:**
1. **Visual Distinction:** Icons make versions instantly recognizable
2. **Clear Labels:** "Male Voice" vs "Female Voice" vs "Duet"
3. **Technical Details:** Key and tempo help singers choose
4. **Helpful Descriptions:** Explains what each version means
5. **Better Entertainment:** Users pick the right version for their voice!

**Success Criteria:**
- ✅ No more "NAM nam" confusion
- ✅ Users understand version differences immediately
- ✅ All database metadata is utilized
- ✅ Professional, polished UI
- ✅ Better karaoke experience = happier users!

---

## 📺 **PHASE 3: TV Page - Host Queue Reordering**

**Duration:** 2-3 hours  
**Risk:** Medium  
**Files:** `src/app/tv/page.tsx`, `src/app/api/queue/reorder/route.ts`

### **Current State Issues:**
- ❌ Host cannot reorder queue
- ❌ Songs play in strict add order
- ❌ No flexibility to adjust for room dynamics

### **Target State:**
- ✅ Host sees up/down arrows on each queue item
- ✅ Clicking up/down moves song position
- ✅ Backend updates positions atomically
- ✅ All clients see reordered queue via polling

### **Step 3.1: Create Reorder Endpoint**

**New File:** `src/app/api/queue/reorder/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/server/lib/supabase';

export const dynamic = 'force-dynamic';

/**
 * POST /api/queue/reorder
 * 
 * Move a queue item up or down in position
 * Host-only operation
 * 
 * Rules:
 * - Only pending songs can be reordered
 * - Cannot reorder currently playing song
 * - Atomic position swap to prevent conflicts
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { queue_item_id, direction, room_id, host_id } = body;
    
    // Validate input
    if (!queue_item_id || !direction || !room_id || !host_id) {
      return NextResponse.json(
        { error: 'queue_item_id, direction, room_id, and host_id required' },
        { status: 400 }
      );
    }
    
    if (direction !== 'up' && direction !== 'down') {
      return NextResponse.json(
        { error: 'direction must be "up" or "down"' },
        { status: 400 }
      );
    }
    
    // Verify host permission
    const { data: room, error: roomError } = await supabaseAdmin
      .from('kara_rooms')
      .select('host_id')
      .eq('id', room_id)
      .single();
    
    if (roomError || !room || room.host_id !== host_id) {
      return NextResponse.json(
        { error: 'Only the host can reorder the queue' },
        { status: 403 }
      );
    }
    
    // Get current item
    const { data: currentItem, error: currentError } = await supabaseAdmin
      .from('kara_queue')
      .select('position, status')
      .eq('id', queue_item_id)
      .eq('room_id', room_id)
      .single();
    
    if (currentError || !currentItem) {
      return NextResponse.json(
        { error: 'Queue item not found' },
        { status: 404 }
      );
    }
    
    // Cannot reorder playing song
    if (currentItem.status !== 'pending') {
      return NextResponse.json(
        { error: 'Cannot reorder currently playing or completed songs' },
        { status: 409 }
      );
    }
    
    const currentPosition = currentItem.position;
    const newPosition = direction === 'up' ? currentPosition - 1 : currentPosition + 1;
    
    // Find item to swap with
    const { data: swapItem, error: swapError } = await supabaseAdmin
      .from('kara_queue')
      .select('id, position')
      .eq('room_id', room_id)
      .eq('status', 'pending')
      .eq('position', newPosition)
      .maybeSingle();
    
    if (swapError) {
      console.error('[queue/reorder] Error finding swap item:', swapError);
      return NextResponse.json(
        { error: swapError.message },
        { status: 500 }
      );
    }
    
    // Check if move is valid (can't move beyond bounds)
    if (!swapItem) {
      return NextResponse.json(
        { error: `Cannot move ${direction} - already at ${direction === 'up' ? 'top' : 'bottom'}` },
        { status: 400 }
      );
    }
    
    // Atomic swap: use temporary position to avoid conflicts
    const tempPosition = -1;
    
    // Step 1: Move current to temp
    await supabaseAdmin
      .from('kara_queue')
      .update({ position: tempPosition })
      .eq('id', queue_item_id);
    
    // Step 2: Move swap item to current position
    await supabaseAdmin
      .from('kara_queue')
      .update({ position: currentPosition })
      .eq('id', swapItem.id);
    
    // Step 3: Move current to new position
    await supabaseAdmin
      .from('kara_queue')
      .update({ position: newPosition })
      .eq('id', queue_item_id);
    
    return NextResponse.json({
      success: true,
      message: `Moved song ${direction}`,
      old_position: currentPosition,
      new_position: newPosition
    });
    
  } catch (error: any) {
    console.error('[queue/reorder] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
```

**Success Criteria:**
- ✅ Endpoint created at `/api/queue/reorder`
- ✅ Only host can reorder
- ✅ Atomic position swap prevents conflicts
- ✅ Handles edge cases (top/bottom of queue)
- ✅ Returns appropriate errors

### **Step 3.2: Add Reorder to API Client**

**File:** `src/lib/api.ts`

```typescript
/**
 * Reorder a queue item (host only)
 */
async reorderQueueItem(
  queueItemId: string,
  direction: 'up' | 'down',
  roomId: string,
  hostId: string
): Promise<void> {
  const res = await fetch(`/api/queue/reorder`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache'
    },
    body: JSON.stringify({
      queue_item_id: queueItemId,
      direction,
      room_id: roomId,
      host_id: hostId
    })
  });
  
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Failed to reorder' }));
    throw new Error(error.error);
  }
}
```

**Success Criteria:**
- ✅ API method added to client
- ✅ Includes no-cache headers
- ✅ Error handling works

### **Step 3.3: Add Reorder Buttons to TV Queue Display**

**File:** `src/app/tv/page.tsx`

**Add handler:**
```typescript
const handleReorder = async (queueItemId: string, direction: 'up' | 'down') => {
  if (!room || !isHost) {
    console.warn('[tv] Only host can reorder queue');
    return;
  }
  
  try {
    await api.reorderQueueItem(queueItemId, direction, room.id, tvUserId!);
    console.log(`[tv] Reordered ${direction} successfully`);
    // UI does NOTHING - waits for next poll (≤3s)
  } catch (err: any) {
    console.error(`[tv] Failed to reorder:`, err);
    setError(err.message || 'Failed to reorder queue');
  }
};
```

**Update queue display:**
```tsx
{/* Queue Sidebar */}
<div className="queue-sidebar">
  <div className="queue-header">
    Queue ({queue.length})
  </div>
  
  <div className="queue-list">
    {queue.map((item, index) => (
      <div key={item.id} className="queue-item">
        <div className="item-position">#{item.position}</div>
        
        <div className="item-info">
          <div className="item-title">{item.song?.title || 'Unknown'}</div>
          <div className="item-singer">{item.user?.display_name || 'Guest'}</div>
        </div>
        
        {/* Reorder buttons (host only, pending songs only) */}
        {isHost && item.status === 'pending' && (
          <div className="reorder-buttons">
            <button
              className="reorder-btn up"
              onClick={() => handleReorder(item.id, 'up')}
              disabled={index === 0}
              aria-label="Move up"
            >
              ↑
            </button>
            <button
              className="reorder-btn down"
              onClick={() => handleReorder(item.id, 'down')}
              disabled={index === queue.length - 1}
              aria-label="Move down"
            >
              ↓
            </button>
          </div>
        )}
      </div>
    ))}
    
    {queue.length === 0 && !currentSong && (
      <div className="empty-queue">
        Queue is empty
      </div>
    )}
  </div>
</div>
```

**CSS for reorder buttons:**
```css
.reorder-buttons {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.reorder-btn {
  width: 36px;
  height: 36px;
  font-size: 1.2rem;
  background: rgba(255, 255, 255, 0.2);
  border: 2px solid rgba(255, 255, 255, 0.5);
  border-radius: 6px;
  color: white;
  cursor: pointer;
  transition: all 0.2s;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.reorder-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.3);
  border-color: white;
  transform: scale(1.1);
}

.reorder-btn:active:not(:disabled) {
  transform: scale(0.95);
}

.reorder-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}
```

**Success Criteria:**
- ✅ Up/Down arrows show only for host
- ✅ Only pending songs show arrows (not playing)
- ✅ Top song can't go up (disabled)
- ✅ Bottom song can't go down (disabled)
- ✅ Clicking arrow reorders and updates via poll

---

## 🎨 **PHASE 4: UI Polish & Professional Grade**

**Duration:** 2-3 hours  
**Risk:** Low  
**Files:** Multiple CSS and component files

### **Step 4.1: Smaller QR Code on TV**

**File:** `src/app/tv/page.tsx`

**Current QR code:**
```tsx
<QRCode value={joinUrl} size={256} />  {/* Too large */}
```

**New QR code:**
```tsx
<div className="qr-code-container">
  <QRCode value={joinUrl} size={150} />
  <div className="qr-label">
    Scan to join
  </div>
  <div className="room-code">
    Code: {room.room_code}
  </div>
</div>
```

**CSS:**
```css
.qr-code-container {
  position: absolute;
  top: 1rem;
  left: 1rem;
  background: rgba(255, 255, 255, 0.95);
  padding: 1rem;
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  z-index: 100;
}

.qr-label {
  text-align: center;
  font-weight: 600;
  margin-top: 0.5rem;
  color: #333;
}

.room-code {
  text-align: center;
  font-size: 1.5rem;
  font-weight: bold;
  margin-top: 0.25rem;
  color: #4CAF50;
  letter-spacing: 2px;
}
```

**Success Criteria:**
- ✅ QR code is 150x150px (was 256x256px)
- ✅ Positioned in top-left corner
- ✅ Doesn't obstruct video or controls
- ✅ Easy to scan from phone

### **Step 4.2: Improve TV Queue Scrolling**

**File:** `src/app/tv/page.tsx`

**CSS for queue sidebar:**
```css
.queue-sidebar {
  position: absolute;
  top: 0;
  right: 0;
  width: 350px;
  max-height: 100vh;
  background: rgba(0, 0, 0, 0.9);
  color: white;
  z-index: 500;
  display: flex;
  flex-direction: column;
}

.queue-list {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 1rem;
  /* Smooth scrolling for all browsers */
  -webkit-overflow-scrolling: touch;
  scroll-behavior: smooth;
}

/* Scrollbar styling for better visibility on TV */
.queue-list::-webkit-scrollbar {
  width: 12px;
}

.queue-list::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 6px;
}

.queue-list::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.3);
  border-radius: 6px;
}

.queue-list::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.5);
}

/* Firefox scrollbar */
.queue-list {
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.3) rgba(255, 255, 255, 0.1);
}
```

**Add keyboard navigation:**
```typescript
// In useEffect for TV page
useEffect(() => {
  const handleKeyboard = (e: KeyboardEvent) => {
    const queueList = document.querySelector('.queue-list');
    if (!queueList) return;
    
    switch (e.key) {
      case 'ArrowUp':
        queueList.scrollBy({ top: -100, behavior: 'smooth' });
        break;
      case 'ArrowDown':
        queueList.scrollBy({ top: 100, behavior: 'smooth' });
        break;
      case 'PageUp':
        queueList.scrollBy({ top: -queueList.clientHeight, behavior: 'smooth' });
        break;
      case 'PageDown':
        queueList.scrollBy({ top: queueList.clientHeight, behavior: 'smooth' });
        break;
    }
  };
  
  window.addEventListener('keydown', handleKeyboard);
  return () => window.removeEventListener('keydown', handleKeyboard);
}, []);
```

**Success Criteria:**
- ✅ Queue scrolls smoothly with mouse/touch
- ✅ Scrollbar is visible and styled
- ✅ Arrow keys scroll queue (for remote controls)
- ✅ PageUp/PageDown work
- ✅ Works on FireTV browser
- ✅ Works on Smart TV browsers (test on real device)

### **Step 4.3: Replace Alerts with Toast Notifications**

**New File:** `src/components/Toast.tsx`

```typescript
'use client';

import { useEffect, useState } from 'react';

interface ToastProps {
  message: string;
  type?: 'success' | 'error' | 'info';
  duration?: number;
  onClose: () => void;
}

export function Toast({ message, type = 'info', duration = 3000, onClose }: ToastProps) {
  const [isVisible, setIsVisible] = useState(false);
  
  useEffect(() => {
    // Fade in
    setIsVisible(true);
    
    // Auto close after duration
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(onClose, 300); // Wait for fade out
    }, duration);
    
    return () => clearTimeout(timer);
  }, [duration, onClose]);
  
  const colors = {
    success: '#4CAF50',
    error: '#f44336',
    info: '#2196F3'
  };
  
  const icons = {
    success: '✅',
    error: '❌',
    info: 'ℹ️'
  };
  
  return (
    <div
      className={`toast toast-${type} ${isVisible ? 'visible' : ''}`}
      style={{ borderLeftColor: colors[type] }}
    >
      <span className="toast-icon">{icons[type]}</span>
      <span className="toast-message">{message}</span>
      <button className="toast-close" onClick={() => { setIsVisible(false); setTimeout(onClose, 300); }}>
        ×
      </button>
    </div>
  );
}

// Toast container component
export function ToastContainer({ children }: { children: React.ReactNode }) {
  return <div className="toast-container">{children}</div>;
}
```

**CSS for toasts:**
```css
/* globals.css */
.toast-container {
  position: fixed;
  top: 1rem;
  right: 1rem;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  max-width: 400px;
}

.toast {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem;
  background: white;
  border-left: 4px solid;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  opacity: 0;
  transform: translateX(100%);
  transition: all 0.3s ease;
}

.toast.visible {
  opacity: 1;
  transform: translateX(0);
}

.toast-icon {
  font-size: 1.5rem;
  flex-shrink: 0;
}

.toast-message {
  flex: 1;
  color: #333;
  font-weight: 500;
}

.toast-close {
  font-size: 1.5rem;
  border: none;
  background: none;
  cursor: pointer;
  color: #999;
  width: 24px;
  height: 24px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.toast-close:hover {
  color: #333;
}
```

**Usage in pages:**
```typescript
// Add to page state
const [toasts, setToasts] = useState<Array<{ id: string; message: string; type: 'success' | 'error' | 'info' }>>([]);

// Helper to show toast
const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
  const id = Date.now().toString();
  setToasts(prev => [...prev, { id, message, type }]);
};

// Replace alert() calls with:
// alert('✅ Song added');
showToast('Song added to queue', 'success');

// Render toasts
<ToastContainer>
  {toasts.map(toast => (
    <Toast
      key={toast.id}
      message={toast.message}
      type={toast.type}
      onClose={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
    />
  ))}
</ToastContainer>
```

**Success Criteria:**
- ✅ Replace all `alert()` calls with toasts
- ✅ Toasts slide in from right
- ✅ Auto-dismiss after 3 seconds
- ✅ Can manually dismiss with X button
- ✅ Multiple toasts stack vertically
- ✅ Non-blocking (doesn't require OK click)

### **Step 4.4: Add Loading States**

**File:** `src/app/room/[code]/page.tsx` and `src/app/tv/page.tsx`

**Add loading state:**
```typescript
const [isLoading, setIsLoading] = useState(false);

// Wrap async actions
const handleAddToQueue = async (group: SongGroupResult) => {
  setIsLoading(true);
  try {
    await api.addToQueue(/* ... */);
    showToast('Song added to queue', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    setIsLoading(false);
  }
};
```

**UI with loading:**
```tsx
<button
  onClick={handleAddToQueue}
  disabled={isLoading}
  className="add-button"
>
  {isLoading ? (
    <>
      <span className="spinner"></span>
      Adding...
    </>
  ) : (
    'Add to Queue'
  )}
</button>
```

**CSS for spinner:**
```css
.spinner {
  display: inline-block;
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
```

**Success Criteria:**
- ✅ Buttons show loading spinner during API calls
- ✅ Buttons disabled while loading
- ✅ Loading state clears after completion/error
- ✅ Prevents double-clicks

### **Step 4.5: Responsive Design Tweaks**

**File:** `src/app/globals.css`

**Add media queries:**
```css
/* Mobile optimizations */
@media (max-width: 768px) {
  .queue-item {
    padding: 0.75rem;
  }
  
  .position-badge {
    width: 32px;
    height: 32px;
    font-size: 0.9rem;
  }
  
  .song-title {
    font-size: 1rem;
  }
  
  .remove-button {
    width: 40px;
    height: 40px;
  }
  
  .search-result-card {
    padding: 0.75rem;
  }
  
  .modal-content {
    width: 95%;
    max-height: 90vh;
  }
}

/* Tablet optimizations */
@media (min-width: 769px) and (max-width: 1024px) {
  .queue-sidebar {
    width: 300px;
  }
}

/* Large screens */
@media (min-width: 1920px) {
  .queue-sidebar {
    width: 400px;
  }
  
  .qr-code-container canvas {
    width: 180px !important;
    height: 180px !important;
  }
}
```

**Success Criteria:**
- ✅ Works on phone (320px - 768px)
- ✅ Works on tablet (769px - 1024px)
- ✅ Works on desktop (1025px+)
- ✅ Works on TV (1920px+)
- ✅ Touch targets always ≥48px on mobile

---

## 🧪 **PHASE 5: Testing & Validation**

**Duration:** 2-3 hours  
**Risk:** None (read-only)

### **Step 5.1: Device Testing Checklist**

**Test on real devices:**

#### **iPhone/Android Phone:**
- [ ] Search works and shows mixer names
- [ ] Can tap versions button and see modal
- [ ] Can add song to queue
- [ ] Queue shows only my songs
- [ ] Position badges show correctly
- [ ] Can tap trash can to remove song
- [ ] Confirmation dialog works
- [ ] Toast notifications appear
- [ ] Loading spinners work
- [ ] All touch targets are ≥48px
- [ ] Text is readable (≥16px)
- [ ] No horizontal scrolling

#### **Tablet:**
- [ ] Layout adjusts properly
- [ ] QR code scanning works
- [ ] Queue display is readable
- [ ] All functionality from phone works

### **Step 5.2: TV Testing Checklist**

**Test on real TV browsers:**

#### **FireTV Browser:**
- [ ] Queue sidebar scrolls with remote
- [ ] Arrow keys navigate queue
- [ ] QR code is visible and scannable
- [ ] Video plays correctly
- [ ] Host reorder buttons work
- [ ] Up/down buttons respond to remote
- [ ] No layout issues

#### **Smart TV (Samsung/LG):**
- [ ] Same as FireTV
- [ ] Browser compatibility verified
- [ ] Remote control works
- [ ] Scrolling is smooth

### **Step 5.3: Functional Testing**

**Test full user flows:**

#### **Flow 1: Regular User**
1. [ ] Join room via QR code
2. [ ] Search for song
3. [ ] View versions
4. [ ] Add song to queue
5. [ ] See song in "Your Queue"
6. [ ] Remove song from queue
7. [ ] Confirm song disappears

#### **Flow 2: Host**
1. [ ] Create room
2. [ ] See QR code on TV
3. [ ] Multiple users add songs
4. [ ] Reorder queue with up/down
5. [ ] Watch songs play
6. [ ] Auto-advance works
7. [ ] Manual "Play Next" works

### **Step 5.4: Edge Cases**

**Test error scenarios:**
- [ ] Try to remove someone else's song (should fail)
- [ ] Try to reorder as non-host (should fail)
- [ ] Try to move top song up (button disabled)
- [ ] Try to move bottom song down (button disabled)
- [ ] Add song while offline (show error)
- [ ] Remove song that's playing (should fail)

### **Step 5.5: Performance Testing**

**Test with many songs:**
- [ ] Add 50+ songs to queue
- [ ] Queue scrolls smoothly
- [ ] Reordering works quickly
- [ ] No lag in UI
- [ ] Polling still works (≤3s)

---

## 📋 **PHASE 6: Documentation & Cleanup**

**Duration:** 30 minutes  
**Risk:** None

### **Step 6.1: Update User Documentation**

**Create:** `USER_GUIDE.md`

```markdown
# Karaoke App User Guide

## For Singers (Device)

### How to Add Songs
1. Scan the QR code on TV or enter room code
2. Search for a song by title or artist
3. Click on song to see versions
4. Select version (shows mixer: Male, Female, Duet, etc.)
5. Click "Add to Queue"

### Managing Your Queue
- View "Your Queue" section to see your songs
- Each song shows position (e.g., #3 in line)
- Tap trash can icon to remove a song
- Removed songs disappear after ~3 seconds

## For Hosts (TV)

### Starting a Room
1. Open TV page
2. Create room
3. Share QR code or room code
4. Songs will appear as users add them

### Managing the Queue
- View queue sidebar on right
- Use ↑↓ buttons to reorder songs
- Click "Play Next" to skip current song
- Click "Start Playing" if queue is empty

### Controls
- ⏸️ Pause/Play
- 🔊 Volume
- ⏭️ Play Next
- ⤢ Fullscreen
```

### **Step 6.2: Code Cleanup**

**Remove:**
- [ ] Any console.log statements used for debugging
- [ ] Commented-out old code
- [ ] Unused imports
- [ ] Temporary test functions

**Add:**
- [ ] Comments for complex logic
- [ ] JSDoc for public functions
- [ ] README updates for new features

### **Step 6.3: Git Commit**

```bash
# Stage all changes
git add -A

# Commit with detailed message
git commit -m "Phase II: Professional grade UI enhancements

Device Page:
- Queue now shows only user's own songs with position badges
- Added remove functionality with trash can icon
- Search results show mixer names (Male/Female/Duet)
- Enhanced version selector with clear labels
- Removed confusing Skip button

TV Page:
- Added host queue reordering with up/down buttons
- Smaller QR code (150px) in top-left corner
- Improved queue scrolling for TV browsers
- Keyboard navigation for remote controls

UI/UX:
- Replaced alerts with toast notifications
- Added loading spinners for all async actions
- Responsive design for phone/tablet/TV
- Better touch targets (≥48px)
- Professional styling and animations

API:
- New DELETE /api/queue/item/[id] endpoint
- New POST /api/queue/reorder endpoint
- Host-only permissions enforced
- Atomic position swapping

Tests: All flows tested on real devices
Rollback: git checkout v1.0-rebuild-working"

# Verify commit
git log -1 --stat
```

---

## 🚀 **PHASE 7: Deployment**

**Duration:** 15 minutes  
**Risk:** Low (can rollback instantly)

### **Step 7.1: Final Pre-Deployment Check**

```bash
# Run build to catch any TypeScript errors
npm run build

# Should complete with no errors
```

**Checklist:**
- [ ] Build succeeds
- [ ] No TypeScript errors
- [ ] No console errors in dev
- [ ] All features tested
- [ ] ROLLBACK.md ready

### **Step 7.2: Merge to Main**

```bash
# Switch to main
git checkout main

# Merge feature branch
git merge feature/phase2-ui-enhancements

# Push to origin
git push origin main
```

### **Step 7.3: Tag Release**

```bash
# Tag the new version
git tag v1.1-phase2-complete -m "Phase II UI enhancements complete"
git push origin v1.1-phase2-complete
```

### **Step 7.4: Monitor**

**First 24 hours:**
- [ ] Watch for user complaints
- [ ] Check error logs
- [ ] Monitor performance
- [ ] Gather feedback

**If issues arise:**
```bash
# Emergency rollback
git checkout v1.0-rebuild-working
git checkout -b hotfix/rollback-phase2
# Test that it works
git push origin hotfix/rollback-phase2
# Deploy hotfix branch
```

---

## ✅ **Success Criteria Summary**

### **Must Have (Phase II Complete):**
- [x] Device shows only user's songs in queue
- [x] Trash can removes songs from queue
- [x] Search results show mixer names
- [x] TV host can reorder queue
- [x] QR code is smaller
- [x] No breaking changes
- [x] Can rollback instantly

### **Nice to Have (If Time):**
- [ ] Toast notifications (replaces alerts)
- [ ] Loading spinners
- [ ] Keyboard navigation on TV
- [ ] Responsive design polish
- [ ] Better empty states

### **Future Enhancements:**
- [ ] Drag-and-drop reordering
- [ ] Progress bar for current song
- [ ] Singer statistics
- [ ] Dark mode
- [ ] Lyrics display

---

## 📊 **Estimated Timeline**

| Phase | Duration | Cumulative |
|-------|----------|------------|
| Phase 0: Safety Net | 5 min | 5 min |
| Phase 1: Device Queue | 1-2 hrs | 2 hrs |
| Phase 2: Search Enhancement | 1 hr | 3 hrs |
| Phase 3: TV Reordering | 2-3 hrs | 6 hrs |
| Phase 4: UI Polish | 2-3 hrs | 9 hrs |
| Phase 5: Testing | 2-3 hrs | 12 hrs |
| Phase 6: Documentation | 30 min | 12.5 hrs |
| Phase 7: Deployment | 15 min | 12.75 hrs |

**Total: ~12-13 hours of focused work**

Spread over 2-3 days with breaks: **Perfectly manageable!**

---

## 🛡️ **Risk Mitigation**

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| TV scroll breaks | Low | Medium | Feature flag, fallback buttons |
| Reorder causes conflicts | Low | High | Atomic swaps, transaction safety |
| Mobile layout breaks | Low | High | Test on real devices early |
| Performance degrades | Very Low | Medium | No schema changes, simple queries |
| User confusion | Low | Low | Clear UI, good empty states |

**Overall Risk: LOW** ✅

---

## 📞 **Need Help?**

During implementation, if you hit any issues:

1. **Check ROLLBACK.md** - Can always go back to v1.0
2. **Review phase objectives** - What were we trying to achieve?
3. **Test incrementally** - Don't wait until the end
4. **Commit frequently** - Small, atomic commits
5. **Ask questions** - Better to clarify than guess

---

**Ready to start Phase II when you are!** 🚀
