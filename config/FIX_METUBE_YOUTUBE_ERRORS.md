# Fix MeTube YouTube Download Errors

## Problem
- `ERROR: The downloaded file is empty`
- `WARNING: [youtube] Some web_safari client https formats have been skipped`
- YouTube is forcing SABR streaming for web_safari client

## Root Cause
MeTube is using `web_safari` client which YouTube is blocking. Need to switch to `android` or `web` client.

## Solution: Update MeTube yt-dlp Configuration

### Step 1: Access MeTube Container Config

```bash
# Find MeTube container
docker ps | grep metube

# Access the container
docker exec -it ix-metube-metube-1 sh

# Navigate to config directory (typical locations)
cd /config
# OR
cd /app/config
# OR check where MeTube stores config
ls -la /app/
ls -la /config/
```

### Step 2: Find yt-dlp Config File

Look for one of these files:
- `ytdlp_config.txt`
- `yt-dlp.conf`
- `config.txt`
- `.yt-dlp.conf`

```bash
# Inside container
find / -name "*ytdlp*" -o -name "*yt-dlp*" 2>/dev/null
find /config -type f 2>/dev/null
find /app -name "*.txt" -o -name "*.conf" 2>/dev/null
```

### Step 3: Update Client Configuration

Once you find the config file, add/modify these settings:

```yaml
# Remove web_safari, use android and web instead
extractor_args:
  youtube:
    player_client: ["android", "web"]
    skip: ["dash"]  # Optional: skip DASH if causing issues

# Or as command-line args format:
--extractor-args "youtube:player_client=android,web"
```

**Or in MeTube's web UI:**
1. Go to MeTube web interface (usually `http://your-server:30094`)
2. Go to Settings → yt-dlp Configuration
3. Add to "Extra yt-dlp arguments":
   ```
   --extractor-args "youtube:player_client=android,web"
   ```

### Step 4: Alternative - Update via API Calls

If you can't access the config file, you can pass yt-dlp options via the API in your scripts.

**Modify `metube_push.sh`:**

```bash
# Around line 80-85, change the curl POST to include yt-dlp options:
curl -fsS -X POST "$METUBE_URL" \
  -H "Content-Type: application/json" \
  -d "{
    \"url\":\"$line\",
    \"quality\":\"best\",
    \"cookies\":\"$COOKIE_FILE\",
    \"ytdlp_options\":\"--extractor-args 'youtube:player_client=android,web'\"
  }"
```

**Modify `retry_failed_metube.sh`:**

```bash
# Around line 131-133, add yt-dlp options:
curl -fsS -X POST "$METUBE_ADD_URL" \
  -H "Content-Type: application/json" \
  -d "{
    \"url\":\"$URL\",
    \"quality\":\"best\",
    \"cookies\":\"$COOKIE_FILE\",
    \"ytdlp_options\":\"--extractor-args 'youtube:player_client=android,web'\"
  }"
```

### Step 5: Update yt-dlp Version

Make sure you're using the latest yt-dlp:

```bash
# Inside MeTube container
pip install --upgrade yt-dlp

# Or if using docker, update the image
docker pull ghcr.io/alexta69/metube:latest
docker restart ix-metube-metube-1
```

### Step 6: Test Configuration

```bash
# Test a single download with new settings
docker exec ix-metube-metube-1 yt-dlp \
  --extractor-args "youtube:player_client=android,web" \
  --cookies /cookies/cookies.txt \
  "https://www.youtube.com/watch?v=zm2hl04YNso" \
  --list-formats
```

If this works, the config is correct.

## Alternative: Force Format Selection

If client switching doesn't work, try forcing specific formats:

```yaml
# In yt-dlp config
format: "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best"
# Or lower quality as fallback
format: "worst[ext=mp4]/worst"
```

## Quick Fix Script

Create this script to update MeTube config:

```bash
#!/bin/bash
# fix_metube_ytdlp.sh

CONTAINER="ix-metube-metube-1"
CONFIG_PATH="/config/ytdlp_config.txt"  # Adjust if different

# Add client config
docker exec "$CONTAINER" sh -c "
  echo '' >> $CONFIG_PATH
  echo '# Fix YouTube client issues' >> $CONFIG_PATH
  echo '--extractor-args \"youtube:player_client=android,web\"' >> $CONFIG_PATH
"

# Restart MeTube
docker restart "$CONTAINER"

echo "MeTube config updated and restarted"
```

## Verify Fix

After making changes:

1. **Restart MeTube:**
   ```bash
   docker restart ix-metube-metube-1
   ```

2. **Watch logs:**
   ```bash
   docker logs -f ix-metube-metube-1
   ```

3. **Test download:**
   - Submit a test URL via MeTube UI or API
   - Check logs for errors
   - Verify file downloads successfully

4. **Check for warnings:**
   - Should NOT see "web_safari client" warnings
   - Should NOT see "downloaded file is empty" errors

## Expected Log Output (After Fix)

**Good:**
```
INFO: [youtube] Downloading video
INFO: [download] Destination: filename.mp4
INFO: [download] 100% of XXX.XXMiB
```

**Bad (what you're seeing now):**
```
WARNING: [youtube] Some web_safari client https formats have been skipped
ERROR: The downloaded file is empty
```

## Notes

- **Cookies:** Your cookies.txt is being updated every minute, which is good. Make sure it's valid.
- **Client Priority:** `android` client usually works best, then `web`, avoid `web_safari`
- **SABR Streaming:** YouTube's new streaming method. Using `android` client usually bypasses this
- **Rate Limiting:** If you still get errors, you might be rate-limited. Add delays between downloads

## If Still Not Working

1. **Check yt-dlp version:**
   ```bash
   docker exec ix-metube-metube-1 yt-dlp --version
   ```
   Should be latest (2024.12.13 or newer)

2. **Test cookies:**
   ```bash
   docker exec ix-metube-metube-1 yt-dlp \
     --cookies /cookies/cookies.txt \
     "https://www.youtube.com/watch?v=test" \
     --list-formats
   ```

3. **Check MeTube version:**
   ```bash
   docker exec ix-metube-metube-1 cat /app/version.txt
   ```
   Update if outdated

4. **Review MeTube documentation:**
   - Check MeTube GitHub for latest yt-dlp configuration options
   - Look for YouTube-specific workarounds
