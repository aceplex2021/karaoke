# Fix MeTube YouTube Download Errors

## Problem
Your MeTube config has:
```json
"player_client": ["web_safari"]
```

This is causing:
- `ERROR: The downloaded file is empty`
- `WARNING: Some web_safari client https formats have been skipped`

## Solution

Change `web_safari` to `android` and `web`:

```json
"player_client": ["android", "web"]
```

## Fixed Config (Copy This)

```json
{"cookiefile":"/cookies/cookies.txt","download_archive":"/archive/metube-archive.txt","extractor_args":{"youtube":{"player_client":["android","web"],"formats":["missing_pot"]}},"format":"bv*[ext=mp4][height<=720]+ba[ext=m4a]/b[ext=mp4][height<=720]/b[height<=720]/b","merge_output_format":"mp4","sleep_interval":60,"max_sleep_interval":90,"sleep_interval_requests":1,"concurrent_fragment_downloads":1,"retries":10,"fragment_retries":10,"retry_sleep":"fragment:exp=2:20","ignoreerrors":true,"no_overwrites":true,"noplaylist":true}
```

## How to Apply in TrueNAS

### Method 1: Via TrueNAS UI (Recommended)

1. **Go to Apps → Installed Applications**
2. **Find "MeTube" and click the 3 dots (⋮) → Edit**
3. **Find the environment variable `YOUTUBE_DL_CONFIG`**
4. **Replace the entire value with the fixed config above**
5. **Click Save**
6. **Restart the container** (or it will restart automatically)

### Method 2: Via Docker Command (If UI doesn't work)

```bash
# Stop container
docker stop ix-metube-metube-1

# Update the environment variable
# (This depends on how TrueNAS manages containers - may need to edit docker-compose or app config)

# Restart
docker start ix-metube-metube-1
```

### Method 3: Direct Container Edit (Temporary - will reset on restart)

```bash
# This is temporary - will be lost on container restart
docker exec -it ix-metube-metube-1 sh -c 'export YOUTUBE_DL_CONFIG='"'"'{"cookiefile":"/cookies/cookies.txt","download_archive":"/archive/metube-archive.txt","extractor_args":{"youtube":{"player_client":["android","web"],"formats":["missing_pot"]}},"format":"bv*[ext=mp4][height<=720]+ba[ext=m4a]/b[ext=mp4][height<=720]/b[height<=720]/b","merge_output_format":"mp4","sleep_interval":60,"max_sleep_interval":90,"sleep_interval_requests":1,"concurrent_fragment_downloads":1,"retries":10,"fragment_retries":10,"retry_sleep":"fragment:exp=2:20","ignoreerrors":true,"no_overwrites":true,"noplaylist":true}'"'"''
```

**Note:** Method 3 is temporary. Use Method 1 to make it permanent.

## What Changed

**Before:**
```json
"player_client": ["web_safari"]
```

**After:**
```json
"player_client": ["android", "web"]
```

## Verify Fix

After updating:

1. **Check logs:**
   ```bash
   docker logs -f ix-metube-metube-1
   ```

2. **Test a download:**
   - Submit a test URL via MeTube
   - Watch logs - should NOT see "web_safari" warnings
   - Should NOT see "downloaded file is empty" errors

3. **Expected success:**
   ```
   INFO: [youtube] Downloading video
   INFO: [download] Destination: filename.mp4
   INFO: [download] 100% of XXX.XXMiB
   ```

## Why This Works

- **web_safari**: YouTube is blocking/limiting this client (SABR streaming)
- **android**: Usually works best, less restrictions
- **web**: Fallback option, more reliable than web_safari

The config will try `android` first, then fall back to `web` if needed.
