# Project Structure

```
karaoke/
├── database/
│   └── schema.sql              # Database schema with kara_* tables
├── scripts/
│   └── index-songs.ts         # Script to index videos from filesystem
├── src/
│   ├── app/                   # Next.js app directory
│   │   ├── layout.tsx         # Root layout
│   │   ├── page.tsx           # Home page (create/join room)
│   │   ├── tv/
│   │   │   └── page.tsx       # TV mode page
│   │   ├── room/
│   │   │   └── [code]/
│   │   │       └── page.tsx   # Phone mode (room joining)
│   │   └── globals.css        # Global styles
│   ├── components/
│   │   └── QRCode.tsx         # QR code component for room joining
│   ├── lib/
│   │   ├── api.ts             # API client functions
│   │   ├── supabase.ts        # Supabase client
│   │   └── utils.ts           # Utility functions
│   ├── server/                # Backend Express server
│   │   ├── index.ts           # Express server entry point
│   │   ├── config.ts          # Configuration
│   │   ├── lib/
│   │   │   ├── supabase.ts    # Supabase admin client
│   │   │   └── queue.ts       # Queue management & fair rotation
│   │   └── routes/
│   │       ├── rooms.ts       # Room CRUD endpoints
│   │       ├── songs.ts       # Song search endpoints
│   │       └── queue.ts       # Queue management endpoints
│   └── shared/
│       └── types.ts           # Shared TypeScript types
├── .env.example               # Environment variables template
├── .gitignore
├── next.config.js             # Next.js configuration
├── package.json               # Dependencies and scripts
├── tsconfig.json              # TypeScript config (frontend)
├── tsconfig.backend.json      # TypeScript config (backend)
├── README.md                  # Main documentation
├── SETUP.md                   # Setup instructions
└── PROJECT_STRUCTURE.md       # This file
```

## Key Components

### Backend (`src/server/`)

- **Express Server**: RESTful API on port 3001
- **Queue Manager**: Implements fair rotation algorithm
- **Routes**: 
  - `/api/rooms` - Room creation and joining
  - `/api/songs` - Song search and history
  - `/api/queue` - Queue management

### Frontend (`src/app/`)

- **Home Page**: Create or join rooms
- **TV Mode** (`/tv`): Video player with queue display
- **Phone Mode** (`/room/:code`): Search and queue management

### Database (`database/schema.sql`)

- All tables prefixed with `kara_*`
- Includes RLS policies
- Functions for room code generation

## Data Flow

1. **TV creates room** → Backend creates room → Returns room code
2. **Phone joins room** → Backend adds participant → Returns room & user
3. **Phone searches songs** → Backend queries Supabase → Returns results
4. **Phone adds to queue** → Queue Manager calculates position → Adds to queue
5. **TV subscribes to queue** → Supabase Realtime updates → Auto-plays next song

## Fair Queue Algorithm

Located in `src/server/lib/queue.ts`:

- Round-robin by user
- Tracks rounds to ensure fairness
- Host can override order
- Automatic position reordering

## Realtime Sync

Uses Supabase Realtime subscriptions:
- TV subscribes to queue changes
- Phones subscribe to queue updates
- All devices stay in sync automatically

