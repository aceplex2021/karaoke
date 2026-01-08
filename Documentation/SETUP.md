# Setup Guide

## Quick Start

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Configure Environment**
   - Copy `.env.example` to `.env`
   - Fill in your Supabase credentials:
     - `NEXT_PUBLIC_SUPABASE_URL`: Your Supabase project URL
     - `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Your Supabase anon/public key
     - `SUPABASE_SERVICE_ROLE_KEY`: Your Supabase service role key (keep secret!)
     - `MEDIA_SERVER_URL`: URL to your TrueNAS media server (e.g., `http://media.local/karaoke/videos`)

3. **Set Up Database**
   - Open your Supabase project dashboard
   - Go to SQL Editor
   - Run the SQL from `database/schema.sql`
   - This creates all tables with the `kara_*` prefix

4. **Index Your Songs**
   - Place your karaoke videos on TrueNAS (or your media server)
   - Update `scripts/index-songs.ts` with your file naming convention
   - Run: `tsx scripts/index-songs.ts /path/to/videos`

5. **Start Development Server**
   ```bash
   npm run dev
   ```
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:3001

## Database Setup Details

### Tables Created

- `kara_rooms`: Stores room information
- `kara_users`: User accounts (anonymous via fingerprint)
- `kara_songs`: Song catalog (indexed from filesystem)
- `kara_queue`: Queue items with fair rotation
- `kara_song_history`: History of songs sung per room
- `kara_room_participants`: Room membership tracking

### Row Level Security (RLS)

RLS is enabled on all tables with permissive policies for now. You can restrict access later based on your needs.

## Media Server Setup

### TrueNAS Configuration

1. Create a dataset for karaoke videos
2. Set up an HTTP server (Nginx, Apache, or TrueNAS built-in)
3. Expose videos at: `http://media.local/karaoke/videos/`
4. Ensure videos are accessible from your TV/device network

### Video File Format

- Supported formats: MP4, WebM, MKV, AVI, MOV
- Recommended: MP4 (H.264) for best browser compatibility
- File naming: Customize `parseFilename()` in `scripts/index-songs.ts`

Example naming conventions:
- `Artist - Title.mp4`
- `Title - Artist.mp4`
- `Title (Language).mp4`

## TV Mode Setup

1. Open http://localhost:3000 on your TV browser
2. Create a room (room persists in localStorage)
3. Display the QR code or room code for others
4. Videos auto-play from queue

## Phone Mode Setup

1. Scan QR code or enter room code
2. Search for songs
3. Add to queue
4. View your position

## Troubleshooting

### Videos Not Playing

- Check `MEDIA_SERVER_URL` is correct
- Ensure media server is accessible from TV network
- Check browser console for CORS errors
- Verify video file paths in database match actual files

### Realtime Not Working

- Verify Supabase Realtime is enabled in your project
- Check Supabase dashboard → Database → Replication
- Ensure tables have replication enabled

### Room Code Not Generating

- Check database connection
- Verify `kara_rooms` table exists
- Review backend logs for errors

## Production Deployment

### Backend

1. Build: `npm run build:backend`
2. Set `NODE_ENV=production`
3. Deploy to your server (PM2, Docker, etc.)

### Frontend

1. Build: `npm run build:frontend`
2. Deploy to Vercel, Netlify, or your hosting
3. Update `BACKEND_URL` in `next.config.js` if backend is separate

### Environment Variables

Ensure all environment variables are set in your production environment.

## Next Steps

- Customize song indexing script for your file structure
- Add user authentication (optional)
- Configure RLS policies for security
- Set up monitoring and logging

