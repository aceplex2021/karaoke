# PWA Development Testing Guide

## 🚀 Quick Start - Testing PWA Locally

### ✅ Method 1: Use Localhost (Easiest)

PWAs work on `localhost` over HTTP without any configuration:

```bash
npm run dev

# Access at:
# http://localhost:3000
```

**Browser Console should show:**
```
[PWA] Dev mode - PWA enabled for local testing
[PWA] Service Worker registered: http://localhost:3000/
```

---

### ✅ Method 2: Test on Mobile Devices (Same Network)

If you need to test on phones/tablets connected to the same WiFi:

#### **Step 1: Find Your Local IP**
```bash
# Windows
ipconfig
# Look for "IPv4 Address" (e.g., 10.0.29.228)

# Mac/Linux
ifconfig
# Look for inet address
```

#### **Step 2: Enable Chrome Flag**

On your **development computer** (where you'll browse from):

1. Open Chrome/Edge
2. Go to: `chrome://flags/#unsafely-treat-insecure-origin-as-secure`
3. Add your local IP:
   ```
   http://10.0.29.228:3000
   ```
4. Restart browser

#### **Step 3: Access from Any Device**

```
http://10.0.29.228:3000
```

PWA features will now work!

---

### ✅ Method 3: Test on Mobile via Chrome Remote Debugging

1. **On Phone**: Enable USB Debugging (Android) or Web Inspector (iOS)
2. **Connect to Computer** via USB
3. **On Computer**: Open Chrome DevTools → Remote Devices
4. **Access** `localhost:3000` from phone through remote debugging

---

## 🧪 Testing PWA Features

### 1. **Service Worker Registration**

Open **Chrome DevTools** → **Application** → **Service Workers**

You should see:
- Status: `Activated and running`
- Source: `/sw.js`
- Scope: Your app URL

### 2. **Manifest**

**Application** → **Manifest**

Verify:
- ✅ Name: "Kara - Karaoke Queue Manager"
- ✅ Icons: 8 icons (72x72 to 512x512)
- ✅ Start URL: "/"
- ✅ Display: "standalone"
- ✅ Share Target: Configured

### 3. **Install Prompt**

#### **Desktop (Chrome/Edge)**
- Click the **install icon** (⊕) in the address bar
- Or: **Three dots** → **Install Kara...**

#### **Mobile (Chrome/Safari)**
- **Chrome**: Banner appears after visiting twice
- **Safari**: Tap **Share** → **Add to Home Screen**

### 4. **Share Target (Mobile Only)**

After installing:
1. Open **YouTube app**
2. Find a video
3. Tap **Share**
4. Select **Kara** from share menu
5. Video should be added to queue

---

## 🐛 Troubleshooting

### Issue: "Service Worker registration failed"

**Solution**:
```bash
# Clear service workers
# Chrome DevTools → Application → Service Workers → Unregister

# Hard refresh
Ctrl+Shift+R (Windows/Linux)
Cmd+Shift+R (Mac)
```

### Issue: "Add to Home Screen" not showing

**Checklist**:
- ✅ Using HTTPS or localhost
- ✅ `manifest.json` is accessible
- ✅ Service worker is registered
- ✅ All icons are present
- ✅ Visited site at least twice (Chrome requirement)

### Issue: Share Target not working

**Requirements**:
- ✅ App must be **installed** (not just opened in browser)
- ✅ Only works on **mobile devices**
- ✅ Only works with **HTTPS** or **localhost**

---

## 📝 Development Checklist

Before testing PWA features:

```bash
# 1. Check icons exist
ls public/icon-*.png

# 2. Verify manifest
curl http://localhost:3000/manifest.json

# 3. Check service worker
curl http://localhost:3000/sw.js

# 4. Start dev server
npm run dev

# 5. Open DevTools → Application
# Verify: Service Worker + Manifest tabs
```

---

## 🔧 Current Configuration

### Environment Variables

```bash
# .env (Development)
NEXT_PUBLIC_COMMERCIAL_MODE=true  # Enable PWA features
```

### PWA Setup Component

Location: `src/components/PWASetup.tsx`

**Dev Mode Override**: Automatically enables PWA on:
- `localhost`
- `127.0.0.1`
- `192.168.x.x` (local network)
- `10.0.x.x` (local network)

### Service Worker

Location: `public/sw.js`

**Policy**: Zero caching (all requests fetch from network)

**Why**: Real-time queue updates, prevents stale data

---

## 🚀 Production Testing

### Vercel Preview Deployments

Every PR/branch gets a preview URL with HTTPS:

```
https://your-app-git-branch-name.vercel.app
```

PWA will work fully on preview deployments!

### Testing Production Build Locally

```bash
# Build
npm run build

# Serve with HTTPS (using local certificate)
npx serve -s out --ssl-cert localhost.pem --ssl-key localhost-key.pem
```

Or use **ngrok** for HTTPS tunnel:

```bash
# Start dev server
npm run dev

# In another terminal
ngrok http 3000

# Access via:
# https://abc123.ngrok.io
```

---

## 📚 Resources

- [PWA Builder](https://www.pwabuilder.com/) - Test your PWA
- [Lighthouse](https://developers.google.com/web/tools/lighthouse) - PWA audit
- [Chrome DevTools - PWA](https://developer.chrome.com/docs/devtools/progressive-web-apps/)

---

## ✅ Quick Verification

### Is PWA working?

1. **Open DevTools** → **Console**
2. **Look for**:
   ```
   [PWA] Dev mode - PWA enabled for local testing
   [PWA] Service Worker registered
   ```
3. **Check** DevTools → Application → Service Workers
4. **Status should be**: "Activated and running"

### Can I install it?

- **Desktop**: Look for install icon in address bar
- **Mobile**: Check "Add to Home Screen" in menu

**If yes** → ✅ PWA is working!
**If no** → Check troubleshooting section above

---

**Updated**: 2026-01-21
**Version**: v4.0
