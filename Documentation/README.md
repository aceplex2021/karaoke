# Karaoke Web App

A web-only karaoke system designed to replace YouTube karaoke at house parties. Works on phones, TVs, tablets, and laptops with no native apps required.

---

## 🛡️ **IMPORTANT: Development Process**

**Before making ANY code changes, read:**
- **[DEVELOPMENT_PROCESS.md](./DEVELOPMENT_PROCESS.md)** - **MANDATORY PROCESS** for all fixes
- **[FIX_WORKFLOW.md](./FIX_WORKFLOW.md)** - Quick reference guide
- **[ISSUE_FIX_TEMPLATE.md](./ISSUE_FIX_TEMPLATE.md)** - Template for documenting issues

**This process prevents regressions and ensures stability. It is mandatory, not optional.**

---

## Features

- **TV Mode**: Persistent room display with auto-playing video queue
- **Phone Mode**: Search songs and add them to the queue
- **Fair Queue System**: Round-robin rotation ensures everyone gets a turn
- **Real-time Sync**: Supabase Realtime keeps all devices in sync
- **Zero Pairing**: Join rooms via QR code or room code
- **Song History**: Tracks what users have sung in each room

## Tech Stack

- **Backend**: Node.js + TypeScript + Express
- **Frontend**: Next.js + React + TypeScript
- **Database**: Supabase (PostgreSQL)
- **Realtime**: Supabase Realtime (WebSocket)
- **Media**: Videos served from TrueNAS via HTTP

## Setup

### Prerequisites

- Node.js 18+
- Supabase project
- TrueNAS media server (or any HTTP server hosting karaoke videos)

### Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   ```bash
   cp .env.example .env
   ```
   
   Fill in your Supabase credentials:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `MEDIA_SERVER_URL` (e.g., `http://media.local/karaoke/videos`)

4. Set up the database:
   - Run the SQL schema from `database/schema.sql` in your Supabase SQL editor
   - This creates all necessary tables with the `kara_*` prefix

5. Index your karaoke videos:
   - Videos should be stored on TrueNAS (or your media server)
   - Run a script to index them into the `kara_songs` table (see `scripts/index-songs.ts` for example)

### Running

Development mode (runs both backend and frontend):
```bash
npm run dev
```

Backend only:
```bash
npm run dev:backend
```

Frontend only:
```bash
npm run dev:frontend
```

The app will be available at:
- Frontend: http://localhost:3000
- Backend API: http://localhost:3001

## Usage

### TV Mode

1. Open http://localhost:3000 on your TV browser
2. Create a room with a name
3. The room persists across sessions (stored in localStorage)
4. Display the room code for others to join
5. Videos auto-play from the queue

### Phone Mode

1. Open http://localhost:3000/room/[CODE] on your phone
2. Search for songs
3. Add songs to the queue
4. View your position in the queue

## Queue Algorithm

The system uses a fair rotation algorithm:

1. Everyone gets one turn before anyone sings again
2. Songs from the same user are queued sequentially within their turn
3. Host can override order and skip/remove songs

Example:
- User A → Song 1
- User B → Song 1
- User C → Song 1
- User A → Song 2 (after everyone has had a turn)

## Database Schema

All tables use the `kara_*` prefix:

- `kara_rooms`: Room information
- `kara_users`: User accounts (anonymous + authenticated)
- `kara_songs`: Song catalog
- `kara_queue`: Queue items
- `kara_song_history`: History of songs sung
- `kara_room_participants`: Room membership

## Future Features (Not Yet Implemented)

- Paid rooms / subscriptions
- Cloud migration (S3 instead of TrueNAS)
- User authentication (optional)
- Advanced analytics

## License

MIT

