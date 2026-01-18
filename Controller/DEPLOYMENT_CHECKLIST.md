# Quick Deployment Checklist

## ⚡ TL;DR

**DON'T:** Copy entire `/Controller` folder ❌  
**DO:** Copy only 7 specific files ✅

---

## 🎯 Quick Start (5 Minutes)

### Step 1: Prepare Files (Windows)
```powershell
cd c:\Users\aceon\AI\karaoke\Controller
.\prepare-production-files.ps1
```

This creates `c:\temp\controller-update\` with 7 files ready to deploy.

### Step 2: Backup TrueNAS Controller
```bash
# SSH into TrueNAS
ssh your-truenas-server

# Backup (change path to match your setup)
cp -r /mnt/pool/karaoke-node /mnt/pool/karaoke-node-backup-$(date +%Y%m%d)
```

### Step 3: Upload 7 Files
Upload ALL files from `c:\temp\controller-update\` to your TrueNAS controller directory.

**Files you're uploading:**
1. ✅ `rules-enhanced.js` (NEW)
2. ✅ `parseFilename-enhanced.js` (NEW)
3. ✅ `dbUpsert-enhanced.js` (NEW)
4. ✅ `channelSources.md` (NEW)
5. ✅ `index.js` (REPLACE)
6. ✅ `promoteIncoming.js` (REPLACE)
7. ✅ `watchVideos.js` (REPLACE)

### Step 4: Restart Controller
```bash
# If using Docker
docker restart karaoke-node

# Watch logs
docker logs -f karaoke-node
```

### Step 5: Test
Drop a test video into your incoming folder and watch it get processed.

---

## 📋 Verification Checklist

After deployment, verify:

- [ ] No import errors in logs
- [ ] Controller starts successfully
- [ ] Test video gets processed
- [ ] Database shows `artist_name` populated
- [ ] Database shows `performance_type` (solo/duet/medley)
- [ ] Mixer/channel detected correctly

---

## 🔄 What Changed?

| Feature | Before | After |
|---------|--------|-------|
| **Artist Detection** | ❌ Not extracted | ✅ Extracted from filename |
| **Performance Type** | ❌ Always "solo" | ✅ Detected (solo/duet/medley/group) |
| **Title Cleanup** | ⚠️ Basic | ✅ Advanced (removes noise, styles, etc.) |
| **Mixer Names** | ⚠️ Hardcoded in code | ✅ Dynamic from channelSources.md |
| **Tone Detection** | ✅ Working | ✅ Improved (handles Vietnamese) |
| **Channel Detection** | ❌ Not working | ✅ Works with accents |

---

## 🆘 Troubleshooting

### Issue: Import errors
**Cause:** Files not uploaded correctly  
**Fix:** Verify all 7 files exist in controller directory

### Issue: Mixer names not detected
**Cause:** `channelSources.md` missing  
**Fix:** Upload `channelSources.md`

### Issue: Database errors
**Cause:** Schema missing columns  
**Fix:** Run `node check-schema.js` (already in your Controller folder)

### Issue: Everything broken
**Fix:** Restore from backup:
```bash
rm -rf /mnt/pool/karaoke-node
cp -r /mnt/pool/karaoke-node-backup-YYYYMMDD /mnt/pool/karaoke-node
docker restart karaoke-node
```

---

## 📝 Post-Deployment

### Adding New Mixers
1. SSH into TrueNAS
2. Edit `channelSources.md`:
   ```bash
   nano /path/to/controller/channelSources.md
   ```
3. Add new name (one per line, use Vietnamese accents)
4. Save and restart controller

### Monitoring
Check a few videos after deployment:
```sql
SELECT 
  title_display,
  artist_name,
  performance_type,
  created_at
FROM kara_songs
WHERE created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC;
```

---

## ✅ Success Criteria

You'll know it's working when:
1. ✅ Controller starts without errors
2. ✅ New videos show artist names in database
3. ✅ Performance type is correctly detected (not always "solo")
4. ✅ Titles are cleaner (no "Karaoke", "Tone Nam", etc.)
5. ✅ Channel/mixer appears in metadata

---

## 📚 Documentation

- **Full Guide:** `INTEGRATION_GUIDE.md`
- **Channel Management:** `CHANNEL_SOURCES_GUIDE.md`
- **Implementation Details:** `DYNAMIC_MIXER_LOADING.md`
- **Database Review:** `DBUPSERT_REVIEW.md`

---

**Ready? Run the PowerShell script to get started! 🚀**

```powershell
cd c:\Users\aceon\AI\karaoke\Controller
.\prepare-production-files.ps1
```
