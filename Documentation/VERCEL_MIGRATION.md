# Vercel Migration - Express to Next.js API Routes

## Summary

Successfully migrated the Express backend server to Next.js API routes, combining frontend and backend into a single Next.js application ready for Vercel deployment.

## Changes Made

### 1. API Routes Conversion
All Express routes have been converted to Next.js API routes:

- **Rooms API** (`src/app/api/rooms/`)
  - `POST /api/rooms/create` → `src/app/api/rooms/create/route.ts`
  - `GET /api/rooms/code/:code` → `src/app/api/rooms/code/[code]/route.ts`
  - `GET /api/rooms/:roomId` → `src/app/api/rooms/[roomId]/route.ts`
  - `GET /api/rooms/:roomId/state` → `src/app/api/rooms/[roomId]/state/route.ts`
  - `POST /api/rooms/join` → `src/app/api/rooms/join/route.ts`

- **Songs API** (`src/app/api/songs/`)
  - `GET /api/songs/search` → `src/app/api/songs/search/route.ts`
  - `GET /api/songs/group/:groupId/versions` → `src/app/api/songs/group/[groupId]/versions/route.ts`
  - `GET /api/songs/:songId` → `src/app/api/songs/[songId]/route.ts`
  - `GET /api/songs/history/:roomId/:userId` → `src/app/api/songs/history/[roomId]/[userId]/route.ts`

- **Queue API** (`src/app/api/queue/`)
  - `GET /api/queue/:roomId` → `src/app/api/queue/[roomId]/route.ts`
  - `POST /api/queue/add` → `src/app/api/queue/add/route.ts`
  - `GET /api/queue/:roomId/current` → `src/app/api/queue/[roomId]/current/route.ts`
  - `POST /api/queue/:roomId/playback-ended` → `src/app/api/queue/[roomId]/playback-ended/route.ts`
  - `POST /api/queue/:roomId/playback-error` → `src/app/api/queue/[roomId]/playback-error/route.ts`
  - `POST /api/queue/item/:queueItemId/skip` → `src/app/api/queue/item/[queueItemId]/skip/route.ts`
  - `POST /api/queue/item/:queueItemId/complete` → `src/app/api/queue/item/[queueItemId]/complete/route.ts`
  - `DELETE /api/queue/item/:queueItemId` → `src/app/api/queue/item/[queueItemId]/route.ts`
  - `POST /api/queue/reorder` → `src/app/api/queue/reorder/route.ts`
  
  **Note:** Queue item operations use `/api/queue/item/` prefix to avoid Next.js routing conflicts between `[roomId]` and `[queueItemId]` dynamic segments.

### 2. Shared Utilities
- Created `src/server/lib/media-url-resolver.ts` to centralize media URL resolution logic (extracted from queue routes)

### 3. Configuration Updates
- **`src/server/config.ts`**: Removed `dotenv` dependency (Next.js handles env vars automatically)
- **`next.config.js`**: Removed API rewrites (no longer needed)
- **`package.json`**:
  - Removed Express dependencies (`express`, `cors`, `dotenv`)
  - Removed Express dev dependencies (`@types/express`, `@types/cors`)
  - Removed build tools (`concurrently`, `cross-env`, `nodemon`, `tsx`)
  - Simplified scripts:
    - `dev`: Single command `next dev -H 0.0.0.0 -p 3000`
    - `build`: `next build`
    - `start`: `next start`

### 4. Frontend Compatibility
- Frontend API client (`src/lib/api.ts`) requires no changes - all URLs match the new routes
- All existing frontend code continues to work without modification

## Architecture

### Before (Separate Servers)
```
┌─────────────────┐         ┌─────────────────┐
│  Next.js        │  ────>  │  Express        │
│  Frontend       │  proxy  │  Backend         │
│  (port 3000)    │         │  (port 3001)     │
└─────────────────┘         └─────────────────┘
```

### After (Single Next.js App)
```
┌─────────────────────────────────┐
│  Next.js Application            │
│  ┌───────────────────────────┐  │
│  │  Frontend Pages           │  │
│  │  - / (home)               │  │
│  │  - /tv (TV page)          │  │
│  │  - /room/[code] (Room)    │  │
│  └───────────────────────────┘  │
│  ┌───────────────────────────┐  │
│  │  API Routes (Backend)     │  │
│  │  - /api/rooms/*           │  │
│  │  - /api/songs/*           │  │
│  │  - /api/queue/*           │  │
│  └───────────────────────────┘  │
└─────────────────────────────────┘
```

## Development

### Running Locally
```bash
npm run dev
```
Single command starts the entire application on port 3000.

### Building for Production
```bash
npm run build
npm run start
```

## Deployment to Vercel

### Prerequisites
1. Vercel account
2. Environment variables configured in Vercel dashboard:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `MEDIA_SERVER_URL` (ngrok URL)

### Steps
1. Connect GitHub repository to Vercel
2. Vercel will auto-detect Next.js
3. Configure environment variables
4. Deploy

### Media Server
- Media server remains on local network (or ngrok)
- `MEDIA_SERVER_URL` environment variable points to ngrok URL
- No changes needed to media server setup

## Notes

- Old Express server files (`src/server/index.ts`, `src/server/routes/*`) are still present but not used
- They can be deleted later if desired, or kept as reference
- All business logic remains unchanged - only the HTTP layer was migrated
- Database schema and Supabase integration unchanged

## Testing Checklist

- [ ] Create room
- [ ] Join room
- [ ] Search songs
- [ ] Add song to queue
- [ ] View queue
- [ ] Play song (TV mode)
- [ ] Skip song
- [ ] Remove song
- [ ] Reorder queue
- [ ] Song playback ended
- [ ] Song playback error

## Next Steps

1. Test all functionality locally
2. Set up Vercel project
3. Configure environment variables
4. Deploy to Vercel
5. Test production deployment
6. Update ngrok URL if needed

