# 🔄 ROLLBACK PROCEDURE

## Quick Rollback to v1.0-working

If Phase II changes cause issues, follow these steps to safely revert.

---

## 🚨 **Emergency Rollback (1 minute)**

### **Option 1: Rollback via Git Tag (Recommended)**

```powershell
# 1. Stop the dev server (Ctrl+C in terminal)

# 2. Checkout the working version
git checkout v1.0-working

# 3. Clear build cache
Remove-Item -Path .next -Recurse -Force -ErrorAction SilentlyContinue

# 4. Restart dev server
npm run dev
```

**Result:** App immediately reverts to last working state before Phase II.

---

### **Option 2: Rollback via Branch**

```powershell
# 1. Stop the dev server (Ctrl+C in terminal)

# 2. Switch back to main branch
git checkout main

# 3. Clear build cache
Remove-Item -Path .next -Recurse -Force -ErrorAction SilentlyContinue

# 4. Restart dev server
npm run dev
```

**Result:** Returns to `main` branch (same as v1.0-working).

---

## 🔍 **What Gets Reverted**

### ✅ **Code Changes (Safe to Revert)**
- Frontend UI changes (device page, TV page)
- Search result enhancements
- QR code sizing
- Toast notifications
- Loading states
- CSS styling

### ⚠️ **Database (No Changes in Phase II)**
Phase II only touches UI/frontend. Database schema remains unchanged:
- ✅ `kara_queue` table unchanged
- ✅ `advance_playback()` function unchanged
- ✅ All data preserved

**No database rollback needed!**

---

## 🛠️ **Troubleshooting After Rollback**

### **Issue: Server won't start**
```powershell
# Kill any process on port 3000
netstat -ano | findstr :3000
# Note the PID, then:
taskkill /F /PID <PID>

# Clear all caches
Remove-Item -Path .next -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path node_modules/.cache -Recurse -Force -ErrorAction SilentlyContinue

# Reinstall dependencies
npm install

# Restart
npm run dev
```

### **Issue: Browser shows old UI**
```
1. Hard refresh: Ctrl+Shift+R (or Cmd+Shift+R on Mac)
2. Clear browser cache
3. Close all tabs and reopen
```

### **Issue: Queue not working after rollback**
```
This shouldn't happen (no DB changes), but if it does:
1. Check server logs in terminal
2. Verify MEDIA_SERVER_URL is set in .env
3. Check Supabase connection
```

---

## 📊 **Rollback Checklist**

Before declaring rollback complete:

- [ ] Server starts without errors
- [ ] Can join room via code
- [ ] Search works on device page
- [ ] Can add songs to queue
- [ ] TV page shows current song
- [ ] Video plays on TV
- [ ] Song advances to next after completion
- [ ] Queue displays correctly

---

## 🎯 **After Successful Rollback**

### **To Return to Feature Branch Later:**
```powershell
git checkout feature/phase2-ui-polish
npm run dev
```

### **To Delete Feature Branch (if abandoning Phase II):**
```powershell
# Switch to main first
git checkout main

# Delete local branch
git branch -D feature/phase2-ui-polish

# Delete remote branch (if pushed)
git push origin --delete feature/phase2-ui-polish
```

---

## 📝 **Version Information**

- **Working Version Tag:** `v1.0-working`
- **Phase II Branch:** `feature/phase2-ui-polish`
- **Last Known Good Commit:** Check `git log v1.0-working`

---

## 🆘 **Emergency Contact**

If rollback fails or causes issues:
1. Check terminal logs for errors
2. Review git status: `git status`
3. Check current branch: `git branch`
4. Verify Node/npm versions: `node -v` and `npm -v`

---

## ✅ **Rollback Success Indicators**

You've successfully rolled back when:
- ✅ Terminal shows "Ready on http://localhost:3000"
- ✅ No errors in server logs
- ✅ Browser loads room page
- ✅ Can search and add songs
- ✅ TV page plays videos
- ✅ All core functionality works

**If all above are ✅, you're back to a working state!**

---

*Last Updated: 2026-01-13*
*Phase: II - UI Polish & Enhancements*
