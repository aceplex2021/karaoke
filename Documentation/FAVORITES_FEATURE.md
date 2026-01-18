# Favorites Feature Implementation

**Date**: 2026-01-17  
**Status**: ✅ Complete - Ready to Test  
**Purpose**: Allow users to mark songs as favorites and access them quickly

## Overview

Implemented a complete Favorites feature that allows users to:
- Mark songs as favorites from the History tab
- View all favorite songs in a dedicated Favorites tab
- Add favorite songs to the queue
- Remove songs from favorites

## Changes Made

### 1. Database Migration
**File**: `database/add_favorites_to_user_preferences.sql`

Added `favorite_song_ids` column to the existing `kara_user_preferences` table:
- **Column**: `favorite_song_ids JSONB` (stores array of song IDs)
- **Default**: Empty array `'[]'::jsonb`
- **Index**: GIN index for efficient JSONB queries
- **Storage**: Favorite song IDs stored as: `["uuid1", "uuid2", ...]`

**To apply this migration**, run:
```sql
psql -U [username] -d [database] -f database/add_favorites_to_user_preferences.sql
```

### 2. API Endpoints
**File**: `src/app/api/users/[userId]/favorites/route.ts` (NEW)

Created three API endpoints:

#### GET `/api/users/:userId/favorites`
- Fetches user's favorite songs
- Returns full song details from `kara_songs` table
- Response: `{ favorites: Song[] }`

#### POST `/api/users/:userId/favorites`
- Adds a song to user's favorites
- Body: `{ song_id: string }`
- Uses UPSERT to create/update `kara_user_preferences` record
- Response: `{ success: true, message: "Added to favorites" }`

#### DELETE `/api/users/:userId/favorites?songId=<uuid>`
- Removes a song from user's favorites
- Query param: `songId`
- Response: `{ success: true, message: "Removed from favorites" }`

### 3. Frontend API Client
**File**: `src/lib/api.ts`

Added three new API methods:
```typescript
async getUserFavorites(userId: string): Promise<{ favorites: Song[] }>
async addFavorite(userId: string, songId: string): Promise<{ success: boolean; message: string }>
async removeFavorite(userId: string, songId: string): Promise<{ success: boolean; message: string }>
```

### 4. Room Page UI
**File**: `src/app/room/[code]/page.tsx`

#### State Variables
- `activeTab`: Updated type to include `'favorites'`
- `favorites`: Array of favorite songs
- `favoritesLoading`: Loading state for favorites
- `favoriteSongIds`: Set of favorite song IDs (for fast lookup)

#### Functions
- `fetchFavorites()`: Loads user's favorite songs
- `toggleFavorite(songId)`: Adds/removes song from favorites with toast notifications
- `fetchHistory()`: Updated to also fetch favorites for heart icon display

#### UI Components

**Favorites Tab Button**:
- Icon: ❤️
- Label: "Favorites"
- Loads favorites when clicked

**History Tab - Heart Icons**:
- Each song displays a heart icon (❤️ filled / 🤍 empty)
- Click to toggle favorite status
- Hover effect (scales to 1.2x)
- Shows tooltip: "Add to favorites" / "Remove from favorites"

**Favorites Tab**:
- Title: "❤️ Your Favorite Songs"
- Displays all favorite songs with:
  - Song title (bold)
  - Artist name
  - Heart icon (❤️) to remove from favorites
  - "Add to Queue" button
- Empty state: "No favorites yet. Add songs from your History tab!"
- Loading state: "Loading favorites..."

## User Flow

1. **Adding a Favorite**:
   - Go to History tab
   - Click the 🤍 (empty heart) icon on any song
   - Heart turns to ❤️ (filled heart)
   - Toast notification: "Added to favorites"

2. **Viewing Favorites**:
   - Click "❤️ Favorites" tab
   - See all favorite songs
   - Click "Add to Queue" to queue a favorite song

3. **Removing a Favorite**:
   - From History tab: Click ❤️ (filled heart) icon
   - From Favorites tab: Click ❤️ icon on the song
   - Heart turns to 🤍 (empty heart)
   - Song removed from Favorites tab
   - Toast notification: "Removed from favorites"

## Technical Details

### Data Storage
- Uses existing `kara_user_preferences` table
- Stores favorites as JSONB array for flexibility
- GIN index ensures fast JSONB queries
- No foreign key constraints (simple array of IDs)

### State Management
- `favoriteSongIds` Set provides O(1) lookup for heart icon display
- Optimistic UI updates (state updates before API response)
- Automatic refetch when switching to Favorites tab
- History tab fetches favorites to display heart icons correctly

### Error Handling
- Toast notifications for all user actions
- Graceful handling of API errors
- Empty states for no favorites/no history

## Testing Checklist

- [ ] Database migration applied successfully
- [ ] Can add song to favorites from History tab
- [ ] Heart icon updates correctly (🤍 ↔ ❤️)
- [ ] Can view favorites in Favorites tab
- [ ] Can remove song from favorites
- [ ] Can add favorite song to queue
- [ ] Toast notifications appear correctly
- [ ] Empty states display when no favorites
- [ ] Loading states display correctly
- [ ] Favorites persist across page refreshes
- [ ] Multiple users can have independent favorites

## Files Modified

### New Files
1. `src/app/api/users/[userId]/favorites/route.ts` - API endpoints
2. `database/add_favorites_to_user_preferences.sql` - Database migration
3. `Documentation/FAVORITES_FEATURE.md` - This document

### Modified Files
1. `src/lib/api.ts` - Added favorites API methods
2. `src/app/room/[code]/page.tsx` - Added Favorites tab and heart icons

## Next Steps

1. **Apply Database Migration**:
   ```bash
   psql -U your_username -d your_database -f database/add_favorites_to_user_preferences.sql
   ```

2. **Start Dev Server**:
   ```bash
   npm run dev
   ```

3. **Test the Feature**:
   - Join a room
   - Go to History tab (sing some songs first if empty)
   - Click heart icons to add/remove favorites
   - Switch to Favorites tab to view favorites
   - Add a favorite song to the queue

## Notes

- Favorites are per-user, not per-room
- Favorites are stored in the user's preferences
- The feature uses the existing user authentication (fingerprint)
- No additional database tables were created
- The implementation reuses the `kara_user_preferences` table for simplicity

## Reversion

If you need to revert this feature:

1. **Database**:
   ```sql
   ALTER TABLE kara_user_preferences DROP COLUMN IF EXISTS favorite_song_ids;
   DROP INDEX IF EXISTS idx_user_preferences_favorite_song_ids;
   ```

2. **Files to delete**:
   - `src/app/api/users/[userId]/favorites/route.ts`
   - `database/add_favorites_to_user_preferences.sql`

3. **Files to revert** (using git):
   - `src/lib/api.ts`
   - `src/app/room/[code]/page.tsx`
