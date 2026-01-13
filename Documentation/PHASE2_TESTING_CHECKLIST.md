# Phase II Testing Checklist

## 📱 Device Page Testing (Phone/Tablet)

### ✅ Queue Tab
- [ ] **Filter User Songs Only**
  - [ ] Only shows current user's songs (not other users')
  - [ ] Position numbers show #1, #2, #3 (user-relative)
  - [ ] Empty state shows when user has no songs

- [ ] **Remove Functionality**
  - [ ] Trash can icon visible on each song
  - [ ] Clicking trash shows confirmation modal
  - [ ] Confirmation modal has Cancel and Remove buttons
  - [ ] Remove button works and shows toast notification
  - [ ] Song disappears from queue after removal (within 2.5s poll)
  - [ ] Error toast shows if removal fails

- [ ] **Loading States**
  - [ ] Remove button shows loading state during removal
  - [ ] Button disabled during operation

### ✅ Search Tab
- [ ] **Search Functionality**
  - [ ] Search input works
  - [ ] Search button shows "Searching..." during operation
  - [ ] Results display correctly
  - [ ] Empty search shows appropriate message

- [ ] **Version Selector Modal**
  - [ ] Modal opens when song has multiple versions
  - [ ] Each version shows:
    - [ ] Icon (👨👩👫🎵)
    - [ ] Mixer label (Male Voice/Female Voice/Duet)
    - [ ] Musical key (if available)
    - [ ] Tempo/BPM (if available)
    - [ ] Recommended badge (if is_default)
    - [ ] Description text
  - [ ] "Add This Version" button works
  - [ ] Success toast shows after adding
  - [ ] Modal closes after selection
  - [ ] Close button (×) works

- [ ] **Add to Queue**
  - [ ] "Add" button works for single version songs
  - [ ] Shows "Adding..." during operation
  - [ ] Success toast appears
  - [ ] Song appears in queue (within 2.5s poll)

### ✅ Toast Notifications
- [ ] **Success Toasts**
  - [ ] Green gradient background
  - [ ] ✅ icon visible
  - [ ] Auto-dismisses after 3 seconds
  - [ ] Can click to dismiss
  - [ ] Multiple toasts stack correctly

- [ ] **Error Toasts**
  - [ ] Red gradient background
  - [ ] ❌ icon visible
  - [ ] Error message clear
  - [ ] Auto-dismisses after 3 seconds

### ✅ Responsive Design
- [ ] **Mobile (Portrait)**
  - [ ] All buttons have 44px+ touch targets
  - [ ] Text readable without zooming
  - [ ] Modals fit on screen
  - [ ] Toast notifications don't overflow
  - [ ] Queue items scroll smoothly

- [ ] **Tablet (Landscape)**
  - [ ] Layout uses space efficiently
  - [ ] Touch targets appropriate
  - [ ] No horizontal scrolling

---

## 📺 TV Page Testing (FireTV/Smart TV)

### ✅ Video Playback
- [ ] Video plays when song is in queue
- [ ] Video URL constructs correctly
- [ ] Auto-advances to next song on completion
- [ ] Error handling works (404, network errors)

### ✅ Queue Sidebar
- [ ] **Scrolling**
  - [ ] Queue scrolls smoothly on TV browsers
  - [ ] Scrollbar visible and usable
  - [ ] Can scroll with remote control
  - [ ] Sticky header works (Queue count stays visible)

- [ ] **Queue Display**
  - [ ] Shows all pending songs
  - [ ] Position numbers visible
  - [ ] Song titles readable
  - [ ] User names displayed

- [ ] **Host Controls** (if user is host)
  - [ ] Up/Down arrows visible
  - [ ] Reorder buttons work
  - [ ] Remove button works
  - [ ] Buttons disabled at boundaries (first/last)

### ✅ QR Code
- [ ] QR code visible in top-left
- [ ] Size is appropriate (90px, not too large)
- [ ] Room code displayed
- [ ] Can scan with phone camera

### ✅ Controls
- [ ] "Play Next" button works
- [ ] "Start Playing" button works (when queue has songs)
- [ ] Manual advance works

---

## 🔄 Cross-Device Testing

### ✅ Real-Time Updates
- [ ] Device page polls every 2.5 seconds
- [ ] Changes from TV reflect on device within 2.5s
- [ ] Changes from device reflect on TV within 2.5s
- [ ] No stale data issues

### ✅ Multiple Users
- [ ] User A adds song → appears in queue
- [ ] User B adds song → appears in queue
- [ ] User A only sees their own songs in device queue
- [ ] TV shows all users' songs
- [ ] User A removes their song → disappears for all
- [ ] User B cannot remove User A's songs

---

## 🐛 Error Handling

### ✅ Network Errors
- [ ] Handles network failures gracefully
- [ ] Shows error toast (not alert)
- [ ] Retries work correctly
- [ ] No infinite loops

### ✅ Invalid States
- [ ] Cannot remove playing song
- [ ] Cannot remove other user's songs
- [ ] Cannot add song without version
- [ ] Handles missing data gracefully

---

## 📊 Performance

### ✅ Loading Times
- [ ] Search results load in < 2 seconds
- [ ] Queue updates feel instant (polling)
- [ ] Modals open smoothly
- [ ] Toasts animate smoothly

### ✅ Memory
- [ ] No memory leaks (check with DevTools)
- [ ] Polling doesn't accumulate
- [ ] Modals clean up properly

---

## ✅ Browser Compatibility

### ✅ Tested Browsers
- [ ] Chrome (Desktop)
- [ ] Safari (Desktop)
- [ ] Firefox (Desktop)
- [ ] Chrome (Mobile)
- [ ] Safari (Mobile/iOS)
- [ ] FireTV Silk Browser
- [ ] Smart TV Browser (Samsung/LG/etc.)

---

## 📝 Notes

**Test Date:** _______________
**Tester:** _______________
**Environment:** _______________

**Issues Found:**
1. 
2. 
3. 

**Pass/Fail:** ☐ Pass  ☐ Fail (see issues above)

---

*Last Updated: 2026-01-13*
*Phase: II - UI Polish & Enhancements*
