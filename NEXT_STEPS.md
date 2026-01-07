# Next Steps - Getting Your Karaoke App Running

## ✅ Step 1: Media Server (DONE!)
Your HTTP media server is running at: `http://10.0.19.10:8090/`

## 📋 Step 2: Set Up Database

1. **Open Supabase Dashboard:**
   - Go to: https://supabase.com/dashboard/project/kddbyrxuvtqgumvndphi

2. **Run Database Schema:**
   - Click on **SQL Editor** in the left sidebar
   - Click **New Query**
   - Open `database/schema.sql` from this project
   - Copy and paste the entire SQL into the editor
   - Click **Run** (or press Ctrl+Enter)
   - You should see "Success. No rows returned"

3. **Verify Tables Created:**
   - Go to **Table Editor** in Supabase
   - You should see these tables:
     - `kara_rooms`
     - `kara_users`
     - `kara_songs`
     - `kara_queue`
     - `kara_song_history`
     - `kara_room_participants`

## 🎵 Step 3: Index Your Songs

You need to populate the `kara_songs` table with your karaoke videos.

### Option A: Use the Indexing Script

1. **Update the script** (`scripts/index-songs.ts`) if needed:
   - Adjust the `parseFilename()` function to match your file naming convention
   - Example: If files are named "Artist - Title.mp4", the script should handle that

2. **Run the indexing script:**
   ```bash
   # First, make sure you can access the videos directory
   # You may need to mount the TrueNAS share or access it via network
   
   # If you have the videos locally accessible:
   tsx scripts/index-songs.ts "C:\path\to\karaoke\videos"
   
   # Or if mounted on Windows:
   tsx scripts/index-songs.ts "\\10.0.19.10\HomeServer\Media\Music\Karaoke\Videos"
   ```

3. **Important:** The `file_path` stored should be relative to your media server root.
   - If your server at `http://10.0.19.10:8090/` serves files directly:
     - File: `song1.mp4` → `file_path`: `song1.mp4`
   - If files are in subdirectories:
     - File: `Artist/song1.mp4` → `file_path`: `Artist/song1.mp4`

### Option B: Manual Entry (For Testing)

For quick testing, you can manually add a song:

1. Go to Supabase → **Table Editor** → `kara_songs`
2. Click **Insert row**
3. Fill in:
   - `title`: "Test Song"
   - `file_path`: "song1.mp4" (or whatever filename exists on your server)
   - `language`: "en"
   - Other fields optional
4. Click **Save**

**Test the URL:** `http://10.0.19.10:8090/song1.mp4` should work in your browser

## 🚀 Step 4: Install Dependencies & Run

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start the development server:**
   ```bash
   npm run dev
   ```
   
   This starts both:
   - Frontend (Next.js): http://localhost:3000
   - Backend (Express): http://localhost:3001

3. **Test the app:**
   - Open http://localhost:3000
   - Create a room (TV mode)
   - Note the room code
   - Open http://localhost:3000/room/[CODE] in another tab/window (phone mode)
   - Search for songs and add to queue

## 🧪 Step 5: Verify Everything Works

1. **Test Media Server:**
   - Open `http://10.0.19.10:8090/` in browser
   - Should see directory listing or be able to access a video file
   - Try: `http://10.0.19.10:8090/[some-video-file].mp4`

2. **Test Database:**
   - Go to Supabase → Table Editor → `kara_songs`
   - Should see your indexed songs

3. **Test App:**
   - Create room on TV mode
   - Join room on phone mode
   - Search and add song
   - Video should play on TV mode

## 🔧 Troubleshooting

### Videos Not Playing
- Check browser console for errors
- Verify `MEDIA_SERVER_URL` in `.env` is correct
- Test media URL directly: `http://10.0.19.10:8090/song1.mp4`
- Check CORS headers if getting CORS errors

### Songs Not Found
- Verify songs are indexed in `kara_songs` table
- Check `file_path` matches actual filename on server
- Test search in Supabase SQL editor:
  ```sql
  SELECT * FROM kara_songs WHERE title ILIKE '%test%';
  ```

### Realtime Not Working
- Go to Supabase → Database → Replication
- Ensure `kara_queue` table has replication enabled
- Check browser console for WebSocket errors

## 📝 File Path Format

Remember: The `file_path` in your database should match what's accessible via HTTP.

**Example:**
- Media server serves: `http://10.0.19.10:8090/song1.mp4`
- Database `file_path`: `song1.mp4`
- App constructs: `http://10.0.19.10:8090/song1.mp4` ✅

If your server has subdirectories:
- Media server serves: `http://10.0.19.10:8090/Artist/song1.mp4`
- Database `file_path`: `Artist/song1.mp4`
- App constructs: `http://10.0.19.10:8090/Artist/song1.mp4` ✅

## 🎉 You're Ready!

Once you've:
- ✅ Set up database (Step 2)
- ✅ Indexed songs (Step 3)
- ✅ Started the app (Step 4)

You should be able to:
- Create rooms on TV
- Join rooms on phones
- Search and queue songs
- Watch videos play automatically!

