# Node Controller Integration Guide

## ⚠️ IMPORTANT: Do NOT Copy Entire Directory

**DON'T:** Just copy/replace the entire `/Controller` directory
**WHY:** You have test files, documentation, and old scripts that shouldn't go to production

## ✅ Safe Integration Steps

### Step 1: Backup Current Controller

Before making any changes, backup your current controller:

```bash
# On TrueNAS (or wherever your controller runs)
cd /path/to/karaoke-node
cp -r . ../karaoke-node-backup-$(date +%Y%m%d)
```

### Step 2: Files to Copy (Production Files Only)

Copy **ONLY** these files to your TrueNAS docker mount:

#### **Required Files (Must Update):**
1. `rules-enhanced.js` → **NEW** (dynamic mixer loading)
2. `parseFilename-enhanced.js` → **NEW** (enhanced parser)
3. `dbUpsert-enhanced.js` → **NEW** (artist + performance_type support)
4. `channelSources.md` → **NEW** (mixer names list)

#### **Update Existing Files (3 files to modify):**
5. `index.js` - Change import to use enhanced parser
6. `promoteIncoming.js` - Change import to use enhanced parser
7. `watchVideos.js` - Change import to use enhanced parser

#### **Keep As-Is (Don't Touch):**
- `package.json`
- `package-lock.json`
- `start.sh`
- `healthcheck.cjs`
- `supabase.js` (already updated)
- All other files (`scanVideos.js`, `normalize.js`, etc.)

### Step 3: File-by-File Instructions

#### 3A. Copy New Enhanced Files

```bash
# On your Windows machine, prepare a temp folder
mkdir C:\temp\controller-update

# Copy only these 4 files:
copy C:\Users\aceon\AI\karaoke\Controller\rules-enhanced.js C:\temp\controller-update\
copy C:\Users\aceon\AI\karaoke\Controller\parseFilename-enhanced.js C:\temp\controller-update\
copy C:\Users\aceon\AI\karaoke\Controller\dbUpsert-enhanced.js C:\temp\controller-update\
copy C:\Users\aceon\AI\karaoke\Controller\channelSources.md C:\temp\controller-update\
```

Then upload these 4 files to your TrueNAS mount.

#### 3B. Update Import Statements (3 files)

**File: `index.js`**
```javascript
// OLD:
import { parseFilename } from './parseFilename.js';

// NEW:
import { parseFilename } from './parseFilename-enhanced.js';
```

**File: `promoteIncoming.js`**
```javascript
// OLD:
import { parseFilename } from "./parseFilename.js";

// NEW:
import { parseFilename } from "./parseFilename-enhanced.js";
```

**File: `watchVideos.js`**
```javascript
// OLD:
import { parseFilename } from "./parseFilename.js";

// NEW:
import { parseFilename } from "./parseFilename-enhanced.js";
```

### Step 4: Verification Checklist

After copying files, verify:

#### ✅ File Structure Check
```bash
ls -la /path/to/controller/
# Should see:
# - rules-enhanced.js (NEW)
# - parseFilename-enhanced.js (NEW)
# - dbUpsert-enhanced.js (NEW)
# - channelSources.md (NEW)
# - index.js (MODIFIED)
# - promoteIncoming.js (MODIFIED)
# - watchVideos.js (MODIFIED)
```

#### ✅ Import Check
```bash
# Check that imports were updated correctly
grep -n "parseFilename" index.js promoteIncoming.js watchVideos.js

# Should see:
# index.js:6:import { parseFilename } from './parseFilename-enhanced.js';
# promoteIncoming.js:5:import { parseFilename } from "./parseFilename-enhanced.js";
# watchVideos.js:5:import { parseFilename } from "./parseFilename-enhanced.js";
```

#### ✅ channelSources.md Check
```bash
cat channelSources.md
# Should see list of mixer names (Vietnamese accents)
```

### Step 5: Restart Node Controller

```bash
# If using docker
docker restart karaoke-node

# Or if using systemd
systemctl restart karaoke-node

# Check logs
docker logs -f karaoke-node
# OR
journalctl -u karaoke-node -f
```

### Step 6: Test Integration

#### Test 1: Check Startup
```bash
# Look for any import errors in logs
docker logs karaoke-node | grep -i error
```

#### Test 2: Process a Test File
Drop a test video file into your incoming folder and watch the logs:
```bash
docker logs -f karaoke-node
```

Look for:
- ✅ Artist extracted correctly
- ✅ Performance type detected (solo/duet/medley)
- ✅ Channel/mixer detected
- ✅ Tone detected

#### Test 3: Verify Database
```sql
-- Check recent entries have new fields
SELECT 
  title_display,
  artist_name,
  performance_type,
  created_at
FROM kara_songs
ORDER BY created_at DESC
LIMIT 10;
```

## 🔄 Alternative: Scripted Update

Save this as `update-controller.sh`:

```bash
#!/bin/bash
# update-controller.sh
# Safely update Node Controller with enhanced parser

CONTROLLER_PATH="/path/to/karaoke-node"  # Change this
BACKUP_PATH="${CONTROLLER_PATH}-backup-$(date +%Y%m%d-%H%M%S)"

echo "🔄 Updating Node Controller..."

# 1. Backup
echo "📦 Creating backup: $BACKUP_PATH"
cp -r "$CONTROLLER_PATH" "$BACKUP_PATH"

# 2. Copy new files
echo "📁 Copying enhanced files..."
cp rules-enhanced.js "$CONTROLLER_PATH/"
cp parseFilename-enhanced.js "$CONTROLLER_PATH/"
cp dbUpsert-enhanced.js "$CONTROLLER_PATH/"
cp channelSources.md "$CONTROLLER_PATH/"

# 3. Update imports
echo "✏️  Updating imports..."
cd "$CONTROLLER_PATH"

sed -i "s|from './parseFilename.js'|from './parseFilename-enhanced.js'|g" index.js
sed -i 's|from "./parseFilename.js"|from "./parseFilename-enhanced.js"|g' promoteIncoming.js
sed -i 's|from "./parseFilename.js"|from "./parseFilename-enhanced.js"|g' watchVideos.js

echo "✅ Update complete!"
echo "📝 Backup saved at: $BACKUP_PATH"
echo "🔄 Restart your Node Controller to apply changes"
```

## 📊 What Changes in Production

### Before (Old Parser):
```javascript
{
  title_display: "Bến Sông Chờ",
  normalized_title: "ben song cho",
  artist_name: null,              // ❌ Missing
  performance_type: "solo",       // ❌ Default only
  // No channel detection
}
```

### After (Enhanced Parser):
```javascript
{
  title_display: "Bến Sông Chờ",     // ✅ Cleaned title
  normalized_title: "ben song cho",  // ✅ No noise
  artist_name: null,                  // ✅ Detected (or null if none)
  performance_type: "solo",           // ✅ Detected (solo/duet/medley/group)
  // Channel: Trọng Hiếu (tracked in metadata)
}
```

## 🚨 Rollback Plan (If Issues)

If something goes wrong:

```bash
# Stop controller
docker stop karaoke-node

# Restore from backup
rm -rf /path/to/karaoke-node
cp -r /path/to/karaoke-node-backup-YYYYMMDD /path/to/karaoke-node

# Restart
docker start karaoke-node
```

## 📝 Files NOT to Copy (Stay Local)

These files are for testing only - **DON'T copy to production:**

- ❌ `test-*.js` (all test files)
- ❌ `check-schema.js`
- ❌ `*.md` files (except `channelSources.md`)
- ❌ `parseFilename.js` (old version, keep as backup)
- ❌ `dbUpsert.js` (old version, keep as backup)
- ❌ `rules.js` (old version, keep as backup)

## 📋 Summary Checklist

- [ ] Backup current controller
- [ ] Copy 4 new files (`*-enhanced.js` + `channelSources.md`)
- [ ] Update 3 import statements (`index.js`, `promoteIncoming.js`, `watchVideos.js`)
- [ ] Verify file structure
- [ ] Verify imports updated
- [ ] Restart controller
- [ ] Check logs for errors
- [ ] Test with sample file
- [ ] Verify database has new fields
- [ ] Celebrate! 🎉

## 🆘 Troubleshooting

### Issue: "Cannot find module './rules-enhanced.js'"
**Fix:** Make sure `rules-enhanced.js` is in the same directory as `parseFilename-enhanced.js`

### Issue: "Cannot find module 'remove-accents'"
**Fix:** Run `npm install` in the controller directory (package.json already has it)

### Issue: Mixer names not detected
**Fix:** Check `channelSources.md` exists and has content:
```bash
cat channelSources.md
```

### Issue: Database errors about artist_name or performance_type
**Fix:** Run schema check:
```bash
cd /path/to/controller
node check-schema.js
```

---

**Next Step:** Start with Step 1 (Backup) and work through the checklist!
