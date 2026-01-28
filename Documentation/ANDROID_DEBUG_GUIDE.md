# Android Debug Guide

## Method 1: On-Screen Debug Panel (Easiest)

The app now includes an **on-screen debug panel** that automatically appears on Android devices:

1. **Open the app on Android** (PWA or Chrome)
2. **Look for the blue "Show Debug" button** in the top-right corner
3. **Tap it** to open the debug panel
4. **All console logs** will appear in real-time, including:
   - Origin URL (should show your ngrok URL)
   - Full page URL
   - All `console.log()`, `console.error()`, and `console.warn()` messages
5. **Tap "Clear"** to clear the logs
6. **Tap "Hide Debug"** to close the panel

The debug panel shows:
- ✅ Timestamp for each log
- ✅ Log type (LOG, ERROR, WARN)
- ✅ Color-coded messages (green for logs, yellow for warnings, red for errors)
- ✅ Last 50 log entries

## Method 2: Chrome Remote Debugging (Advanced)

If you need more advanced debugging (network requests, breakpoints, etc.):

### Prerequisites
- Android device with USB debugging enabled
- USB cable to connect device to computer
- Chrome browser on your computer

### Steps

1. **Enable USB Debugging on Android:**
   - Go to **Settings** → **About phone**
   - Tap **Build number** 7 times (enables Developer options)
   - Go back to **Settings** → **Developer options**
   - Enable **USB debugging**

2. **Connect Device:**
   - Connect Android device to computer via USB
   - On Android, when prompted, tap **Allow USB debugging**

3. **Open Chrome DevTools:**
   - On your computer, open Chrome
   - Go to `chrome://inspect` in the address bar
   - You should see your Android device listed
   - Under "Remote Target", find your app/PWA
   - Click **inspect**

4. **View Console:**
   - In DevTools, click the **Console** tab
   - All console logs will appear here
   - You can also use **Network**, **Elements**, and other tabs

### Troubleshooting Remote Debugging

- **Device not showing?** Make sure USB debugging is enabled and device is unlocked
- **"inspect" button grayed out?** Try disconnecting and reconnecting USB, or restart Chrome
- **Can't see PWA?** Make sure the PWA is open on your Android device

## Method 3: ADB Logcat (Command Line)

For system-level debugging:

```bash
# Install ADB (Android Debug Bridge) if not already installed
# Then connect device and run:
adb logcat | grep -i "chromium\|console\|youtube"
```

## What to Look For

When debugging the YouTube embedding issue, check for:

1. **Origin Parameter:**
   ```
   [YouTubePlayer] Android detected - added origin: https://98408f91f910.ngrok-free.app
   ```

2. **Container Visibility:**
   ```
   [YouTubePlayer] Android container verified: { width: 320, height: 180, ... }
   ```

3. **Player Initialization:**
   ```
   [YouTubePlayer] Initializing player for video: [VIDEO_ID]
   [YouTubePlayer] Player ready
   ```

4. **Errors:**
   ```
   [YouTubePlayer] Error: 101
   [Music Queue] YouTube error: 101
   ```

5. **YouTube API Status:**
   ```
   [YouTubePlayer] API loaded and ready
   [YouTubePlayer] Container not visible yet on Android, forcing visibility...
   ```

## Common Issues

### Error 101/150: "Video not allowed to be played in embedded players"
- **Check origin:** Should match your ngrok URL exactly
- **Check container visibility:** Container must have width > 0 and height > 0
- **Check user interaction:** Player must be initialized after user interaction (click)

### Container Not Visible
- Look for logs: `Container not visible yet on Android`
- Check if container has `display: none` or `visibility: hidden`
- Verify container is in viewport (not scrolled off-screen)

### Origin Mismatch
- Origin in logs should match your ngrok URL
- If using ngrok, make sure URL is `https://` not `http://`
- Check for any redirects that might change the origin
