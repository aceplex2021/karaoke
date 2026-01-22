# 📱 iOS PWA Testing & Troubleshooting Guide

## ✅ Fixes Applied

1. ✅ Added **180x180 icon** (iOS standard size)
2. ✅ Fixed `purpose: "any"` in manifest (was `"any maskable"`)
3. ✅ Added ngrok wildcard to `allowedDevOrigins`
4. ✅ Updated all Apple touch icon references

---

## 🧪 **STEP-BY-STEP iOS Testing**

### **Step 1: Restart Dev Server**

**IMPORTANT**: Restart to apply ngrok wildcard fix:

```bash
# Stop server (Ctrl+C)
npm run dev
```

### **Step 2: Clear iOS Safari Cache**

**On iPhone**:
1. Settings → Safari
2. Tap "Clear History and Website Data"
3. Confirm "Clear History and Data"

**Or more targeted**:
1. Settings → Safari → Advanced → Website Data
2. Search for your ngrok domain
3. Swipe left → Delete

### **Step 3: Remove Old PWA (if exists)**

1. Long-press the "Kara" icon on home screen
2. Tap "Remove App" or "Delete"
3. Confirm

### **Step 4: Visit Site in Safari**

1. Open **Safari** (not Chrome/other browsers)
2. Visit your ngrok URL: `https://98408f91f910.ngrok-free.app`
3. **IMPORTANT**: Make sure it's the ngrok URL, not `localhost`

### **Step 5: Check Browser Console**

**Enable Safari Dev Tools**:
1. Settings → Safari → Advanced
2. Enable "Web Inspector"

**On Mac** (if you have one):
1. Connect iPhone via USB
2. Safari → Develop → [Your iPhone] → [Your Site]
3. Check console for errors

**Look for**:
- ✅ `[PWA] Service Worker registered`
- ✅ `[PWA] iOS detected - Add to Home Screen available`
- ❌ Any manifest.json errors
- ❌ Any icon loading errors

### **Step 6: Add to Home Screen**

1. In Safari, tap **Share** button (square with arrow)
2. Scroll down in share sheet
3. Tap **"Add to Home Screen"**
4. **Expected**: 
   - ✅ Shows "Kara" as app name
   - ✅ Shows purple "K" icon preview
   - ✅ "Add" button is enabled
5. Tap **"Add"**

### **Step 7: Verify Installation**

1. **Check home screen**: Purple "Kara" icon appears
2. **Tap icon**: App opens in **full screen** (no Safari UI at top/bottom)
3. **Check status**: Running as standalone app

**Verify standalone mode**:
```javascript
// In Safari console (before adding to home screen)
const isPWA = window.matchMedia('(display-mode: standalone)').matches;
console.log('Is PWA?', isPWA); // Should be false in Safari

// After adding to home screen, open app and check again
// Should be true
```

---

## 🔍 **Troubleshooting iOS Installation**

### **Issue: "Add to Home Screen" option doesn't appear**

**Possible causes**:
1. ❌ Not using Safari (must use Safari on iOS)
2. ❌ Not using HTTPS (ngrok provides HTTPS ✅)
3. ❌ Manifest.json has errors
4. ❌ Service Worker registration failed

**Check**:
```javascript
// In Safari console:
fetch('/manifest.json')
  .then(r => r.json())
  .then(m => console.log('Manifest OK:', m))
  .catch(e => console.error('Manifest error:', e));

navigator.serviceWorker.getRegistration()
  .then(reg => console.log('SW registered:', !!reg))
  .catch(e => console.error('SW error:', e));
```

---

### **Issue: "Add to Home Screen" button is grayed out**

**Possible causes**:
1. ❌ Missing required icon sizes
2. ❌ Icons failed to load (404)
3. ❌ Manifest validation failed

**Check Network Tab** (Safari Dev Tools):
- `/manifest.json` → Should be 200, not 404
- `/icon-180x180.png` → Should be 200, not 404
- `/icon-192x192.png` → Should be 200, not 404

---

### **Issue: Icon shows but app doesn't install**

**Possible causes**:
1. ❌ Service Worker not registered
2. ❌ JavaScript errors preventing app from loading
3. ❌ Cross-origin issues

**Check Console** (Safari Dev Tools):
- Look for any red errors
- Specifically check for:
  - `Failed to register service worker`
  - `Blocked cross-origin request`
  - `Failed to load manifest`

---

### **Issue: App installs but crashes/blank screen**

**Possible causes**:
1. ❌ JavaScript bundles blocked (cross-origin)
2. ❌ Service Worker blocking resources
3. ❌ Ngrok domain not in `allowedDevOrigins`

**Check**: Look at terminal for cross-origin warnings

---

## 📋 **Complete iOS Requirements Checklist**

### **Manifest.json** ✅ FIXED:
- ✅ `"name": "Kara - Karaoke Queue Manager"`
- ✅ `"short_name": "Kara"`
- ✅ `"start_url": "/"`
- ✅ `"display": "standalone"`
- ✅ `"theme_color": "#667eea"`
- ✅ `"background_color": "#ffffff"`
- ✅ Icons with `"purpose": "any"` (NOT `"any maskable"`)
- ✅ **180x180 icon** (iOS standard)

### **HTML Meta Tags** ✅ FIXED:
- ✅ `<meta name="apple-mobile-web-app-capable" content="yes">`
- ✅ `<meta name="apple-mobile-web-app-status-bar-style" content="default">`
- ✅ `<meta name="apple-mobile-web-app-title" content="Kara">`
- ✅ `<link rel="apple-touch-icon" href="/icon-180x180.png">`
- ✅ `<link rel="manifest" href="/manifest.json">`

### **Icons** ✅ FIXED:
- ✅ 72x72, 96x96, 128x128, 144x144
- ✅ 152x152, **180x180** (NEW!), 192x192
- ✅ 384x384, 512x512
- ✅ All exist in `/public` folder
- ✅ All are valid PNG files

### **Service Worker** ✅:
- ✅ Registered at `/sw.js`
- ✅ Handles install, activate, fetch
- ✅ Auto-update enabled

### **Next.js Config** ✅ FIXED:
- ✅ `allowedDevOrigins` includes ngrok wildcards
- ✅ No cross-origin blocking

---

## 🎯 **What Changed This Update**

### **1. Added 180x180 Icon** (Critical for iOS)
```html
<!-- iOS Safari specifically looks for this size -->
<link rel="apple-touch-icon" href="/icon-180x180.png" />
```

### **2. Wildcard ngrok Domains** (Dev Convenience)
```javascript
allowedDevOrigins: [
  '*.ngrok-free.app',  // ✅ Works with ANY ngrok domain
  '*.ngrok.io',        // ✅ Legacy domains too
]
```

Now you don't need to update config every time ngrok restarts!

---

## 🚀 **Quick Test Commands**

### **On iPhone (Safari Console)**:

**1. Check if PWA-capable:**
```javascript
// Should all be "yes" or true
console.log('Meta capable:', document.querySelector('meta[name="apple-mobile-web-app-capable"]')?.content);
console.log('Manifest:', document.querySelector('link[rel="manifest"]')?.href);
console.log('Touch icon:', document.querySelector('link[rel="apple-touch-icon"]')?.href);
```

**2. Check Service Worker:**
```javascript
navigator.serviceWorker.getRegistration().then(reg => {
  console.log('SW registered:', !!reg);
  if (reg) console.log('SW scope:', reg.scope);
});
```

**3. Check Manifest:**
```javascript
fetch('/manifest.json')
  .then(r => r.json())
  .then(m => {
    console.log('Manifest name:', m.name);
    console.log('Manifest icons:', m.icons.length);
    console.log('Has 180x180?', m.icons.some(i => i.sizes === '180x180'));
  });
```

**4. Check Icons Load:**
```javascript
fetch('/icon-180x180.png')
  .then(r => console.log('180x180 icon:', r.status === 200 ? '✅' : '❌'));
```

---

## ⚠️ **Common iOS PWA Gotchas**

### **1. Must Use Safari**
- Chrome/Firefox on iOS → No PWA support
- **Only Safari supports "Add to Home Screen"**

### **2. HTTPS Required**
- HTTP → No PWA
- Localhost → No PWA
- ngrok → ✅ Provides HTTPS

### **3. iOS Version**
- **iOS 11.3+**: Basic PWA support
- **iOS 16.4+**: Share Target API support
- Check: Settings → General → About → Version

### **4. Private Browsing**
- Private mode → No Service Workers
- **Use normal Safari mode**

### **5. Clear Everything**
- Old cached manifests can break installation
- Always clear before testing

---

## 📊 **Expected vs Actual**

### **What You Should See on iOS:**

**In Safari (before adding)**:
1. Visit site
2. Share button → "Add to Home Screen" option appears
3. Preview shows "Kara" name + icon
4. "Add" button is **enabled** (not grayed out)

**After adding to home screen**:
1. Icon appears with "Kara" label
2. Tap icon → Opens **full screen** (no Safari UI)
3. Status bar shows at top
4. App functions normally

**If "Add to Home Screen" is grayed out or missing**:
- ❌ Manifest has errors
- ❌ Required icons missing
- ❌ Service Worker failed
- ❌ Using private mode

---

## 🔧 **Emergency Diagnostic: Test Without Share Target**

If iOS still won't show "Add to Home Screen", test with a simplified manifest:

### **Temporarily Switch Manifest:**

```typescript
// In layout.tsx, change:
manifest: '/manifest.json',
// To:
manifest: '/manifest-no-share.json',
```

**File ready**: `public/manifest-no-share.json` (same as manifest.json but NO share_target)

**Why**: iOS Share Target API is iOS 16.4+ only. If you have older iOS or if Share Target validation is failing, this tests if that's the blocker.

**Test**:
1. Change layout.tsx to use `manifest-no-share.json`
2. Restart dev server
3. Clear Safari cache
4. Try "Add to Home Screen"

**If it works**:
- ✅ PWA installation works
- ❌ YouTube sharing won't work (but that's expected)
- 👉 Means `share_target` was causing iOS to reject the manifest

**If it still doesn't work**:
- Something else is wrong
- Check console for specific errors

---

## 🎊 **Success Indicators**

### **iOS PWA is working when you see:**

**1. In Safari:**
- ✅ No console errors
- ✅ `[PWA] iOS detected - Add to Home Screen available`
- ✅ `[PWA] Service Worker registered`

**2. Share Sheet:**
- ✅ "Add to Home Screen" option appears
- ✅ Preview shows "Kara" with icon
- ✅ "Add" button is clickable

**3. Home Screen:**
- ✅ Purple "K" icon appears
- ✅ Label shows "Kara"
- ✅ Tap opens in standalone mode

**4. Running as PWA:**
- ✅ No Safari UI (address bar, toolbar)
- ✅ Status bar at top only
- ✅ All features work
- ✅ Can share from YouTube (iOS 16.4+)

---

## 🚀 **Next Steps**

### **1. Restart Dev Server:**
```bash
npm run dev
```

### **2. Test on iPhone:**
1. Clear Safari cache
2. Visit ngrok URL
3. Open Safari console (if possible)
4. Check for errors
5. Try "Add to Home Screen"

### **3. Report Back:**
- Does "Add to Home Screen" appear?
- Is "Add" button enabled or grayed out?
- Any console errors?
- What iOS version are you using?

---

## 🎯 **Files Changed This Fix**

1. ✅ `public/manifest.json` → Added 180x180 icon
2. ✅ `src/app/layout.tsx` → Updated apple-touch-icon refs
3. ✅ `next.config.js` → Wildcard ngrok domains
4. ✅ `public/icon-180x180.png` → Generated iOS standard icon

---

**Applied**: 2026-01-21  
**Critical Fix**: Added 180x180 icon for iOS Safari  
**Status**: 🧪 **RESTART SERVER → TEST ON iOS!**
