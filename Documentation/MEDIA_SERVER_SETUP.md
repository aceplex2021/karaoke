# Media Server Setup Guide

## Current Storage Location

Your karaoke videos are stored at:
```
/10.0.19.10/HomeServer/Media/Music/Karaoke/Videos
```

This is a network share (SMB/CIFS), but the web app needs to access videos over **HTTP**, not as a file path.

## Setup Options

### Option 1: Simple HTTP Server Container (Recommended - Easiest for TrueNAS Scale)

**Why this works best:**
- No complex configuration needed
- Works directly with TrueNAS Scale Apps
- Lightweight and fast
- Perfect for simple file serving

**Option 1a: Python HTTP Server (Simplest)**

1. **Create a custom app in TrueNAS Scale:**
   - Go to Apps → Custom App
   - Use this configuration:

   ```yaml
   apiVersion: v1
   kind: Pod
   metadata:
     name: karaoke-file-server
   spec:
     containers:
     - name: http-server
       image: python:3.11-alpine
       command: ["python", "-m", "http.server", "8000", "--directory", "/videos"]
       ports:
       - containerPort: 8000
       volumeMounts:
       - name: videos
         mountPath: /videos
     volumes:
     - name: videos
       hostPath:
         path: /mnt/[your-pool]/HomeServer/Media/Music/Karaoke/Videos
   ```

2. **Or use a pre-built solution:**
   - Search for "http-server" or "file-server" in Apps
   - Or use "halverneus/static-file-server" image

**Option 1b: Caddy Server (Best for CORS + Simple Config)**

Caddy is simpler than Nginx and handles CORS automatically.

1. **Install via TrueNAS Scale Apps:**
   - Search for "caddy" or create custom app with image: `caddy:alpine`

2. **Create Caddyfile (mount as config):**
   ```
   :80 {
       handle /karaoke/videos/* {
           file_server {
               root /srv
               browse
           }
           header {
               Access-Control-Allow-Origin *
               Access-Control-Allow-Methods "GET, HEAD, OPTIONS"
           }
       }
   }
   ```

3. **Container setup:**
   - Host path: `/mnt/[pool]/HomeServer/Media/Music/Karaoke/Videos`
   - Container path: `/srv/karaoke/videos`
   - Port: `80`

**Option 1c: Node.js HTTP Server**

1. **Create custom app with this image:** `node:alpine`

2. **Use a simple file server script** (mount as volume):
   ```javascript
   const http = require('http');
   const fs = require('fs');
   const path = require('path');
   
   const port = 8000;
   const videoDir = '/videos';
   
   http.createServer((req, res) => {
       // CORS headers
       res.setHeader('Access-Control-Allow-Origin', '*');
       res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
       res.setHeader('Accept-Ranges', 'bytes');
       
       if (req.method === 'OPTIONS') {
           res.writeHead(200);
           res.end();
           return;
       }
       
       const filePath = path.join(videoDir, req.url);
       const stat = fs.statSync(filePath);
       
       res.writeHead(200, {
           'Content-Type': 'video/mp4',
           'Content-Length': stat.size
       });
       
       const stream = fs.createReadStream(filePath);
       stream.pipe(res);
   }).listen(port);
   ```

**Update `.env` after setup:**
```
MEDIA_SERVER_URL=http://10.0.19.10:8000/karaoke/videos
# Or if using Caddy on port 80:
MEDIA_SERVER_URL=http://10.0.19.10/karaoke/videos
```

### Option 1b: Jellyfin on TrueNAS Scale (If you want a full media server)

**Pros:**
- Full-featured media server
- Web interface for browsing
- Can serve files over HTTP

**Cons:**
- Overkill for simple file serving
- More resource intensive
- May require authentication
- File URLs might be more complex (e.g., `/Items/{id}/Download`)

**If using Jellyfin:**
1. Install Jellyfin via TrueNAS Scale Apps
2. Configure it to scan your karaoke videos directory
3. You'll need to either:
   - Use Jellyfin's API to get direct file URLs (more complex)
   - Or configure Jellyfin to expose files at a simple path
   - Or use Jellyfin's web interface alongside the karaoke app

**Recommendation:** Use Jellyfin only if you also want a media server for other purposes. For just karaoke, Nginx is simpler.

### Option 2: Nginx on TrueNAS (Traditional Install)

1. **Install Nginx on TrueNAS** (via Apps or shell)

2. **Create Nginx configuration** to serve your videos:
   ```nginx
   server {
       listen 80;
       server_name 10.0.19.10;

       # Serve karaoke videos
       location /karaoke/videos/ {
           alias /mnt/[your-pool]/HomeServer/Media/Music/Karaoke/Videos/;
           
           # Enable CORS for web app
           add_header 'Access-Control-Allow-Origin' '*' always;
           add_header 'Access-Control-Allow-Methods' 'GET, HEAD, OPTIONS' always;
           
           # Allow video streaming
           add_header 'Accept-Ranges' 'bytes' always;
           
           # Cache control
           expires 1h;
       }
   }
   ```

3. **Update `.env`**:
   ```
   MEDIA_SERVER_URL=http://10.0.19.10/karaoke/videos
   ```

### Option 2: Apache on TrueNAS

1. **Install Apache** on TrueNAS

2. **Create virtual host**:
   ```apache
   <VirtualHost *:80>
       ServerName 10.0.19.10
       
       Alias /karaoke/videos /mnt/[pool]/HomeServer/Media/Music/Karaoke/Videos
       
       <Directory "/mnt/[pool]/HomeServer/Media/Music/Karaoke/Videos">
           Options Indexes FollowSymLinks
           AllowOverride None
           Require all granted
           
           # CORS headers
           Header set Access-Control-Allow-Origin "*"
       </Directory>
   </VirtualHost>
   ```

3. **Update `.env`**:
   ```
   MEDIA_SERVER_URL=http://10.0.19.10/karaoke/videos
   ```

### Option 3: Use a Separate Server

If you have another machine on your network:

1. **Mount the TrueNAS share** on that machine
2. **Set up Nginx/Apache** to serve from the mount point
3. **Update `.env`** with that server's IP/URL

### Option 4: TrueNAS Built-in Web Server

If TrueNAS has a built-in web server feature:

1. Enable it in TrueNAS settings
2. Configure it to serve from your Videos directory
3. Update `.env` accordingly

## File Path Configuration

When indexing songs (using `scripts/index-songs.ts`), the `file_path` stored in the database should be **relative to the base URL**.

**Example:**
- Video file: `song1.mp4` in `/mnt/pool/HomeServer/Media/Music/Karaoke/Videos/`
- `file_path` in database: `song1.mp4`
- Final URL: `http://10.0.19.10/karaoke/videos/song1.mp4`

If videos are in subdirectories:
- Video file: `Artist/Album/song1.mp4`
- `file_path` in database: `Artist/Album/song1.mp4`
- Final URL: `http://10.0.19.10/karaoke/videos/Artist/Album/song1.mp4`

## Testing

After setting up the web server, test it:

```bash
# Should return video file or directory listing
curl http://10.0.19.10/karaoke/videos/

# Test a specific file
curl -I http://10.0.19.10/karaoke/videos/song1.mp4
```

## CORS Configuration

Make sure your web server allows CORS, as browsers will block cross-origin requests. The examples above include CORS headers.

## Security Considerations

- Consider restricting access to your local network only
- Don't expose the media server to the internet unless necessary
- Use authentication if exposing publicly

