# TrueNAS Scale - Simple File Server Setup

Since TrueNAS Scale doesn't have a simple Nginx option, here are the easiest ways to serve your karaoke videos over HTTP.

## Quick Solution: Python HTTP Server (5 minutes)

### Step 1: Create Custom App

1. Go to **Apps** → **Custom App**
2. Click **Create** or **Deploy**

### Step 2: Configure Container

**Basic Settings:**
- **Name:** `karaoke-file-server`
- **Image:** `python:3.11-alpine`
- **Port:** `8000` (Host Port: `8000` or any available port)

**Command/Args:**
- **Command:** `python`
- **Args:** `-m http.server 8000 --directory /videos`

**Storage:**
- **Host Path:** `/mnt/[your-pool]/HomeServer/Media/Music/Karaoke/Videos`
- **Mount Path:** `/videos`

**Network:**
- **Host Network:** Enable (or use NodePort)

### Step 3: Deploy and Test

1. Click **Deploy**
2. Wait for container to start
3. Test: `http://10.0.19.10:8000/` (should show directory listing)

### Step 4: Update .env

```
MEDIA_SERVER_URL=http://10.0.19.10:8000
```

**Note:** Python's HTTP server serves from root, so files will be at:
- `http://10.0.19.10:8000/song1.mp4`
- Your `file_path` in database should be just `song1.mp4`

## Alternative: Caddy (Better CORS Support)

### Step 1: Create Custom App

**Image:** `caddy:alpine`

**Command:** `caddy`
**Args:** `file-server --listen :80 --root /srv --browse`

**Storage:**
- **Host Path:** `/mnt/[pool]/HomeServer/Media/Music/Karaoke/Videos`
- **Mount Path:** `/srv/karaoke/videos`

**Port:** `80`

### Step 2: Update .env

```
MEDIA_SERVER_URL=http://10.0.19.10/karaoke/videos
```

## Alternative: Use TrueNAS Scale Shell

If you prefer not to use containers, you can run a simple server directly:

1. **SSH into TrueNAS Scale** or use Shell in UI
2. **Navigate to videos directory:**
   ```bash
   cd /mnt/[pool]/HomeServer/Media/Music/Karaoke/Videos
   ```
3. **Run Python server:**
   ```bash
   python3 -m http.server 8000
   ```
4. **Or install and use a simple tool:**
   ```bash
   # Install serve (Node.js tool)
   npm install -g serve
   serve -p 8000 /mnt/[pool]/HomeServer/Media/Music/Karaoke/Videos
   ```

**Note:** This runs in foreground - use `screen` or `tmux` to keep it running, or create a systemd service.

## Recommended: Python Container (Easiest)

The Python HTTP server container is the simplest option:
- ✅ No configuration files needed
- ✅ Works immediately
- ✅ Lightweight
- ✅ Built into Python (no extra installs)

Just remember:
- Files are served from root: `http://10.0.19.10:8000/filename.mp4`
- Set `MEDIA_SERVER_URL=http://10.0.19.10:8000` in `.env`
- Store relative paths in database: `song1.mp4` not `/karaoke/videos/song1.mp4`

## CORS Note

Python's simple HTTP server doesn't add CORS headers by default. If you get CORS errors:

1. **Use Caddy instead** (handles CORS automatically)
2. **Or create a custom Python script** with CORS headers (see MEDIA_SERVER_SETUP.md)
3. **Or use a reverse proxy** (but that's more complex)

## Testing

After setup, test:
```bash
# Should show directory listing
curl http://10.0.19.10:8000/

# Test a specific file
curl -I http://10.0.19.10:8000/song1.mp4
```

