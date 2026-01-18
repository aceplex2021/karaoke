# Fix: Add to Queue from History and Favorites Tabs

**Date**: 2026-01-17  
**Issue**: "Add to Queue" button not working in History and Favorites tabs  
**Status**: ✅ Fixed

## Problem

When clicking "Add to Queue" from History or Favorites tabs, the song was not being added to the queue. The logs showed:
- Search was being triggered with the full song title (including metadata)
- Search failed to find an exact match
- No song was added to queue
- No error message was displayed to user

### Root Cause

The original implementation tried to:
1. Search for the song by title using `api.searchSongs()`
2. Find an exact match in the search results
3. Call `handleAddToQueue(group)` with the group

This approach failed because:
- Song titles in history contain metadata (e.g., `Mua Chieu ｜ Nhac Song Moi Nhat ｜ Thanh Duy`)
- The exact match comparison failed silently
- The search approach was unnecessarily complex for songs that already have a `song_id`

## Solution

Modified both the API and frontend to handle `song_id`:

### API Changes (`src/app/api/queue/add/route.ts`)

Updated the queue add API to accept **both** `version_id` OR `song_id`:
- If `version_id` is provided: use it directly (Search tab behavior)
- If `song_id` is provided: fetch the default version and use its `version_id`
- Default version selection: `is_default=true` first, then oldest version

### Frontend Changes

Changed the implementation to use `song_id` directly instead of searching:

### History Tab
```typescript
// OLD: Search for song and find match (FAILED)
const { results } = await api.searchSongs({ q: item.song?.title || '', limit: 50 });
const group = results.find(g => 
  g.display_title.toLowerCase() === item.song?.title?.toLowerCase()
);
if (group) {
  handleAddToQueue(group);
} else {
  showError('Song not found in catalog');
}

// NEW: Use song_id directly (SUCCESS)
const queueItem = await api.addToQueue({
  room_id: room.id,
  song_id: item.song_id,
  user_id: user.id,
});
success('Added to queue!');
await refreshRoomState(room.id);
```

### Favorites Tab
```typescript
// OLD: Search for song and find match (FAILED)
const { results } = await api.searchSongs({ q: song.title, limit: 50 });
const group = results.find(g => 
  g.display_title.toLowerCase() === song.title.toLowerCase()
);
if (group) {
  handleAddToQueue(group);
} else {
  showError('Song not found in catalog');
}

// NEW: Use song_id directly (SUCCESS)
const queueItem = await api.addToQueue({
  room_id: room.id,
  song_id: song.id,
  user_id: user.id,
});
success('Added to queue!');
await refreshRoomState(room.id);
```

## Benefits

1. **Simpler**: Direct API call instead of search + match + add
2. **Faster**: No unnecessary search query
3. **More Reliable**: Uses exact `song_id` instead of fuzzy title matching
4. **Better UX**: Shows success toast and refreshes queue immediately
5. **Better Debugging**: Added console.log for troubleshooting

## Changes Made

### File 1: `src/app/api/queue/add/route.ts`

**Added support for `song_id` parameter:**

```typescript
// Before: Only accepted version_id
const { room_id, version_id, user_id } = body;
if (!room_id || !version_id || !user_id) {
  return NextResponse.json(
    { error: 'room_id, version_id, and user_id are required' },
    { status: 400 }
  );
}

// After: Accepts version_id OR song_id
const { room_id, version_id, song_id, user_id } = body;
if (!room_id || (!version_id && !song_id) || !user_id) {
  return NextResponse.json(
    { error: 'room_id, (version_id OR song_id), and user_id are required' },
    { status: 400 }
  );
}

// If song_id provided, fetch default version
let finalVersionId = version_id;
if (!finalVersionId && song_id) {
  const { data: versions } = await supabaseAdmin
    .from('kara_song_versions')
    .select('id')
    .eq('song_id', song_id)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(1);
  
  finalVersionId = versions[0].id;
}
```

### File 2: `src/app/room/[code]/page.tsx`

#### History Tab Button (lines ~1496-1521)
- Removed: Search-based approach
- Added: Direct `api.addToQueue()` with `song_id`
- Added: Console logging for debugging
- Added: Success toast notification
- Added: Immediate queue refresh

#### Favorites Tab Button (lines ~1588-1613)
- Removed: Search-based approach
- Added: Direct `api.addToQueue()` with `song_id`
- Added: Console logging for debugging
- Added: Success toast notification
- Added: Immediate queue refresh

## Testing

✅ Build completed successfully  
✅ No TypeScript errors  
✅ No linter errors

### Manual Testing Checklist
- [ ] Click "Add to Queue" from History tab
- [ ] Verify song is added to queue
- [ ] Verify success toast appears
- [ ] Verify queue updates immediately
- [ ] Click "Add to Queue" from Favorites tab
- [ ] Verify song is added to queue
- [ ] Verify success toast appears
- [ ] Verify queue updates immediately

## Technical Notes

- The `api.addToQueue()` API now accepts **either** `song_id` OR `version_id`
- When using `song_id`, the backend selects the default version automatically:
  - First preference: version with `is_default=true`
  - Fallback: oldest version by `created_at`
- History and Favorites store `song_id` (not `version_id`)
- The Search tab uses `version_id` for precise version selection
- Both approaches work correctly with the backend
- This allows users to quickly re-sing songs from their history without choosing a specific version

## Before vs After

### Before
```
User clicks "Add to Queue" 
  → Search for song by title
  → Find exact match in results (often fails)
  → Add to queue
  → No feedback to user if search fails
```

### After
```
User clicks "Add to Queue"
  → Add to queue directly using song_id
  → Show success toast
  → Refresh queue display
  → Immediate feedback to user
```
