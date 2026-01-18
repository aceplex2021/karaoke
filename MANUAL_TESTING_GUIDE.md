# Manual Testing Guide - YouTube-Like Search

## 🎯 Test Environment

**Dev Server:** http://localhost:3000 (currently running)  
**Branch:** `feature/youtube-search-v1`  
**Commit:** `31976ec`

---

## ✅ Pre-Test Checklist

- [x] Automated tests passed
- [x] Build successful (no errors)
- [x] API endpoint tested (200 OK)
- [x] Dev server running
- [x] Local commit created
- [ ] Manual UI testing (YOUR TASK)
- [ ] Mobile testing (YOUR TASK)
- [ ] Final approval (YOUR TASK)

---

## 🧪 Manual Test Cases

### **Test 1: Search Tab - Basic Functionality**

**Steps:**
1. Navigate to http://localhost:3000
2. Create or join a room
3. Go to "Search" tab
4. Search for: `love`

**Expected Results:**
- ✅ YouTube-like card grid appears (not a list)
- ✅ Multiple cards displayed (up to 50)
- ✅ Each card shows:
  - Song title (large, bold)
  - Artist name (smaller, gray)
  - Metadata badges (tone, style, pitch, etc.)
  - Two buttons: "Preview" (blue) and "Add to Queue" (green)
- ✅ Cards arranged in responsive grid (shrink window to test)

**Screenshot Location:** (take screenshot if needed)

---

### **Test 2: Preview Functionality**

**Steps:**
1. Click "Preview" button on any card
2. Wait and observe
3. Click "Preview" on a different card
4. Click "Stop" button while playing

**Expected Results:**
- ✅ Audio starts playing immediately
- ✅ Button changes to "Stop" (red)
- ✅ Preview stops automatically after 10 seconds
- ✅ Starting new preview stops the previous one
- ✅ "Stop" button stops playback immediately
- ✅ Card border highlights in blue when active

**Notes:**
- Preview starts at 30 seconds into the song
- Volume is set to 50% by default
- Only one preview plays at a time

---

### **Test 3: Add to Queue**

**Steps:**
1. Search for a song
2. Click "Add to Queue" button (don't preview first)
3. Check Queue tab
4. Play a preview, then click "Add to Queue"
5. Check Queue tab again

**Expected Results:**
- ✅ Toast notification: "Song added to queue!"
- ✅ Button shows "Adding..." briefly (disabled)
- ✅ Song appears in Queue tab (may take 2-3s for poll)
- ✅ Preview stops when adding to queue (if playing)
- ✅ Can add same version multiple times

---

### **Test 4: Search Variations**

**Test different queries:**

| Query | Expected Results |
|-------|------------------|
| `test` | Shows ~5 results |
| `love` | Shows 50+ results (limit 50) |
| `` (empty) | Error: "Please enter a search term" |
| `x` (1 char) | Error: "Please enter at least 2 characters" |
| `zzzzzzzzzz` | "No versions found" message |

---

### **Test 5: Metadata Display**

**Check badge visibility:**

Look for cards with different metadata:
- ✅ Tone badges: 👨 Male, 👩 Female (blue/pink)
- ✅ Mixer badges: 🎤 [Mixer Name] (gray)
- ✅ Style badges: 🎵 BEAT, ACOUSTIC, etc. (orange)
- ✅ Pitch badges: 🎹 C, D#m, etc. (green)
- ✅ Tempo badges: ⚡ [BPM] BPM (purple-ish)
- ✅ Duration badges: ⏱️ MM:SS (purple)

**Note:** Not all songs have all metadata. Some badges may not appear.

---

### **Test 6: Responsive Grid**

**Steps:**
1. Resize browser window to different widths:
   - Desktop: 1920px wide
   - Tablet: 768px wide
   - Mobile: 375px wide

**Expected Results:**
- ✅ Desktop: 3-4 cards per row
- ✅ Tablet: 2 cards per row
- ✅ Mobile: 1 card per row (full width)
- ✅ Cards don't overlap
- ✅ Buttons remain readable/clickable

---

### **Test 7: Error Handling**

**Test error scenarios:**

1. **Preview Failure:**
   - If a preview fails to load, card shows:
     - Red error message: "Preview failed. Try adding to queue instead."
     - Preview button grayed out

2. **Network Issues:**
   - Disconnect internet temporarily
   - Try searching
   - Expected: Error toast notification

3. **Empty Queue:**
   - Add song to queue when not in a room
   - Expected: Error message

---

### **Test 8: Mobile Testing (if available)**

**Device:** [Your device/emulator]

**Steps:**
1. Open http://localhost:3000 on mobile device
2. Create/join room
3. Test all above scenarios

**Mobile-Specific Checks:**
- ✅ Cards stack vertically (full width)
- ✅ Touch targets are large enough (buttons)
- ✅ Preview works on mobile Safari/Chrome
- ✅ Scrolling is smooth
- ✅ No horizontal scrolling
- ✅ Toast notifications visible

---

## 🐛 Bug Report Template

**If you find issues, report like this:**

```
Bug: [Short description]
Steps to Reproduce:
1. [Step 1]
2. [Step 2]
Expected: [What should happen]
Actual: [What actually happened]
Browser: [Chrome/Firefox/Safari + version]
Screenshot: [If applicable]
```

---

## ✅ Approval Checklist

After testing, confirm:

- [ ] Search returns results correctly
- [ ] Card layout looks good (YouTube-like)
- [ ] Preview plays and stops correctly
- [ ] Add to Queue works
- [ ] Metadata badges display properly
- [ ] Responsive grid works on mobile
- [ ] No console errors
- [ ] No visual glitches
- [ ] Performance is acceptable
- [ ] Ready to push to origin

---

## 🚀 Next Steps

**If all tests pass:**
1. Type approval in chat
2. I'll push to origin
3. Create PR (optional)

**If issues found:**
1. Report bugs using template above
2. I'll fix issues
3. Re-test
4. Repeat until approved

---

## 🔄 Rollback (if needed)

**If critical issues found:**

```bash
# Quick rollback
git checkout main
npm run dev

# Restore from backups
cp .backups/search-revamp/*.* [original locations]
```

---

## 📊 Test Results (Fill in)

**Date:** [Your date]  
**Tester:** [Your name]  
**Duration:** [Time spent]

**Overall Status:** [ ] PASS / [ ] FAIL / [ ] NEEDS FIXES

**Notes:**
[Your notes here]
