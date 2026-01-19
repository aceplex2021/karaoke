# 🚀 Node Controller Deployment Checklist
**Date:** 2026-01-18  
**Purpose:** Deploy updated Node Controller for DB Revamp

---

## 📋 Files to Deploy

### **Updated Files (copy to TrueNAS):**

1. ✅ **parseFilename-enhanced.js** → `parseFilename.js`
   - Fixed nam/nu token bug
   - Returns all metadata fields

2. ✅ **dbUpsert-revamped.js** → `dbUpsert.js`
   - Writes to new simplified schema
   - No more kara_songs table
   - Writes ALL metadata to kara_versions

3. ✅ **watchVideos.js**
   - Updated metaForDbFromParsed()
   - Passes all parser fields to dbUpsert

4. ✅ **rules-enhanced.js** → `rules.js`
   - Dynamically loads from channelSources.md
   - Already deployed (no changes needed)

5. ✅ **channelSources.md**
   - Mixer/channel names list
   - Already deployed (no changes needed)

---

## 🔧 Deployment Steps

### **Step 1: Backup Current Files**
```bash
ssh root@truenas
cd /mnt/HomeServer/Media/Music/Karaoke/Controller

# Create timestamped backup
BACKUP_DIR="controller-backup-$(date +%Y%m%d-%H%M%S)"
mkdir -p "../$BACKUP_DIR"
cp parseFilename.js dbUpsert.js watchVideos.js "../$BACKUP_DIR/"

echo "✅ Backup created in ../$BACKUP_DIR"
```

### **Step 2: Copy New Files from Windows**

From **Windows** (PowerShell):
```powershell
# Navigate to project directory
cd C:\Users\aceon\AI\karaoke\Controller

# Copy to TrueNAS (replace these with your actual commands)
scp parseFilename-enhanced.js root@truenas:/mnt/HomeServer/Media/Music/Karaoke/Controller/parseFilename.js
scp dbUpsert-revamped.js root@truenas:/mnt/HomeServer/Media/Music/Karaoke/Controller/dbUpsert.js
scp watchVideos.js root@truenas:/mnt/HomeServer/Media/Music/Karaoke/Controller/watchVideos.js
```

Or manually via Windows file share if you prefer.

### **Step 3: Verify Files on TrueNAS**
```bash
ssh root@truenas
cd /mnt/HomeServer/Media/Music/Karaoke/Controller

# Check files were copied
ls -lh parseFilename.js dbUpsert.js watchVideos.js

# Verify parseFilename.js has the nam/nu fix
grep -n "isToneContext" parseFilename.js | head -3

# Expected: Should show the new isToneContext logic
```

### **Step 4: Restart Node Controller**
```bash
# Restart Docker container
docker restart ix-karaoke-node-karaoke-node-1

# Wait for startup
sleep 5

# Check if running
docker ps | grep karaoke

# Expected: Should show "Up X seconds"
```

### **Step 5: Monitor Logs**
```bash
# Watch logs for errors
docker logs -f ix-karaoke-node-karaoke-node-1

# Expected output:
# 🧠 Supabase upsert enabled (WRITE_DB=true)
# 📂 watching: /karaoke/Videos/Incoming

# Press Ctrl+C to stop watching
```

---

## ✅ Verification

### **Check 1: No Errors on Startup**
```bash
docker logs --tail 50 ix-karaoke-node-karaoke-node-1 | grep -i error

# Expected: No "ERR_MODULE_NOT_FOUND" or similar errors
```

### **Check 2: Environment Correct**
```bash
docker exec ix-karaoke-node-karaoke-node-1 cat /app/.env | grep WRITE_DB

# Expected: WRITE_DB=true
```

### **Check 3: Files Exist in Container**
```bash
docker exec ix-karaoke-node-karaoke-node-1 ls -la /app/parseFilename.js /app/dbUpsert.js /app/watchVideos.js

# Expected: All 3 files exist with recent timestamps
```

---

## 🧪 Test Write (Before Full Re-scan)

**Test with 1 file first!**

### **Step 1: Prepare Test File**
```bash
ssh root@truenas
cd /mnt/HomeServer/Media/Music/Karaoke/Videos

# Copy ONE file to /Incoming for testing
cp "$(ls *.mp4 | head -1)" Incoming/

# Note the filename
ls Incoming/
```

### **Step 2: Watch Processing**
```bash
docker logs -f ix-karaoke-node-karaoke-node-1

# Expected output:
# 🗄️  upserted metadata: Test_Song__nam.mp4
# ✅ promoted+deleted incoming: Test_Song__nam.mp4
```

### **Step 3: Verify Database**

In **Supabase SQL Editor**:
```sql
-- Check if version was created with all metadata
SELECT 
  title_display,
  tone,
  mixer,
  style,
  artist_name,
  performance_type,
  label,
  key
FROM kara_versions
ORDER BY created_at DESC
LIMIT 1;

-- Expected: Should show the test file with all metadata populated
```

### **Step 4: Check File Record**
```sql
-- Check if file was linked to version
SELECT 
  v.title_display,
  v.tone,
  v.mixer,
  f.storage_path
FROM kara_files f
JOIN kara_versions v ON v.id = f.version_id
ORDER BY f.created_at DESC
LIMIT 1;

-- Expected: Should show file with storage_path and version metadata
```

---

## ⚠️ Troubleshooting

### **Error: Module Not Found**
```bash
# Check imports in dbUpsert.js
docker exec ix-karaoke-node-karaoke-node-1 head -10 /app/dbUpsert.js

# Verify supabase.js and titleCase.js exist
docker exec ix-karaoke-node-karaoke-node-1 ls -la /app/supabase.js /app/titleCase.js
```

### **Error: Column Does Not Exist**
```bash
# Verify migration ran successfully
# Run verification queries from EXECUTE_DB_REVAMP_NUCLEAR.sql
```

### **Error: Write Failed**
```bash
# Check WRITE_DB environment variable
docker exec ix-karaoke-node-karaoke-node-1 printenv | grep WRITE_DB

# Check Supabase credentials
docker exec ix-karaoke-node-karaoke-node-1 printenv | grep SUPABASE
```

---

## 📊 Success Criteria

After deployment:
- ✅ Docker container running (not restarting)
- ✅ No errors in logs
- ✅ Test file processed successfully
- ✅ Database shows version with all metadata (tone, mixer, style, artist)
- ✅ File linked to version correctly

**If all checks pass, proceed to full re-scan!**

---

## 🎯 Next: Full Re-scan

Once test passes:
```bash
# Move ALL files to /Incoming
cd /mnt/HomeServer/Media/Music/Karaoke/Videos
ls *.mp4 | xargs -I {} mv {} Incoming/

# Monitor progress
docker logs -f ix-karaoke-node-karaoke-node-1
```

**Estimated time:** 30 minutes - 2 hours (depending on number of files)
