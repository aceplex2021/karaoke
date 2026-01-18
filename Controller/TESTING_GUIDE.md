# TESTING ENHANCED NODE CONTROLLER

**Date:** January 17, 2026  
**Status:** Ready for testing

---

## 📦 What Was Created

### **Enhanced Files:**
- `rules-enhanced.js` - All cleanup patterns and rules
- `parseFilename-enhanced.js` - Enhanced parser with 6 cleanup functions
- `dbUpsert-enhanced.js` - Database writer with artist and performance_type
- `test-enhanced.js` - Comprehensive test suite

### **Key Features:**
✅ Title cleanup (removes pipes, noise words)  
✅ Artist extraction (English, Vietnamese composer, KARAOKE format)  
✅ Performance type detection (solo/duet/medley/group)  
✅ Tone cleaning (normalize to Nam/Nữ)  
✅ Channel extraction (Vietnamese mixer names)  
✅ Style extraction (Beat, Bolero, Ballad, etc.)

---

## 🧪 Testing Steps

### **Step 1: Run Unit Tests**

Test the parser logic without touching the database:

```bash
cd Controller
node test-enhanced.js
```

**Expected output:**
```
🎤 Testing Enhanced Node Controller

Test: Full-width pipe cleanup
File: ｜ Khi Nao Chau Duong ｜ Chuan [Nam - Trong Hieu].mp4
✅ PASS

Test: English artist extraction
File: Aespa Whiplash.mp4
✅ PASS

... (10 tests total)

Test Summary: 10 passed, 0 failed
```

---

### **Step 2: Test Parser in Isolation**

Create a quick test to see parsed output:

```bash
cd Controller
node -e "import('./parseFilename-enhanced.js').then(m => console.log(m.parseFilename('｜ Khi Nao ｜ Chuan [Nam].mp4')))"
```

**Check for:**
- `title_clean`: "Khi Nao" (no pipes!)
- `tone`: "Nam" (capitalized)
- `performance_type`: "solo"
- `artist_name`: null (or correct artist if pattern matches)

---

### **Step 3: Integration Test with Database (DRY RUN)**

Test with a few real files WITHOUT writing to database:

1. **Create test index file** (`Controller/index-test.js`):

```javascript
import { parseFilename } from './parseFilename-enhanced.js';
import { readdir } from 'fs/promises';
import { join } from 'path';

const testDir = process.argv[2] || '/mnt/HomeServer/Media/Music/Karaoke/Videos';

console.log(`Scanning: ${testDir}`);

const files = (await readdir(testDir))
  .filter(f => f.endsWith('.mp4'))
  .slice(0, 10); // First 10 files only

console.log(`\nParsing ${files.length} files...\n`);

for (const file of files) {
  const storagePath = `/Videos/${file}`;
  const result = parseFilename(file, storagePath);
  
  console.log('━'.repeat(80));
  console.log(`File: ${file}`);
  console.log(`Title: ${result.title_clean}`);
  console.log(`Artist: ${result.artist_name || 'null'}`);
  console.log(`Tone: ${result.tone || 'null'}`);
  console.log(`Channel: ${result.channel || 'null'}`);
  console.log(`Style: ${result.style || 'null'}`);
  console.log(`Performance: ${result.performance_type}`);
  console.log(`Label: ${result.label}`);
}
```

2. **Run it:**

```bash
cd Controller
node index-test.js /path/to/your/videos
```

3. **Verify:**
- Titles are clean (no pipes, no "nhac song")
- Artists extracted where applicable
- Performance types detected correctly
- Tone normalized to "Nam" or "Nữ"

---

### **Step 4: Update Main Controller (CAREFUL!)**

Once tests pass, you can update the main controller to use enhanced versions:

#### **Option A: Side-by-side (Safest)**

Keep both versions running and compare results:

```javascript
// index.js
import { parseFilename as parseOld } from './parseFilename.js';
import { parseFilename as parseNew } from './parseFilename-enhanced.js';

// Compare outputs
const file = 'test.mp4';
console.log('OLD:', parseOld(file));
console.log('NEW:', parseNew(file, '/Videos/test.mp4'));
```

#### **Option B: Direct replacement (After testing)**

1. **Backup originals:**
   ```bash
   cd Controller
   cp parseFilename.js parseFilename-backup.js
   cp dbUpsert.js dbUpsert-backup.js
   cp rules.js rules-backup.js
   ```

2. **Replace with enhanced versions:**
   ```bash
   cp parseFilename-enhanced.js parseFilename.js
   cp dbUpsert-enhanced.js dbUpsert.js
   cp rules-enhanced.js rules.js
   ```

3. **Test in `test` mode:**
   ```bash
   MODE=test node index.js
   ```

---

### **Step 5: Test with Real Database (Small Sample)**

1. **Pick 5-10 test files**
2. **Delete their entries** from Supabase (so they can be re-indexed)
3. **Run controller** to re-index them
4. **Verify in Supabase:**
   - `kara_songs.artist_name` populated
   - `kara_songs.performance_type` set
   - `kara_songs.title` is clean
   - `kara_song_groups.base_title_display` is clean

---

## ✅ Verification Checklist

After testing, verify:

### **Parser Tests:**
- [ ] All 10 unit tests pass
- [ ] Titles are clean (no pipes, no noise words)
- [ ] Artists extracted correctly
- [ ] Mixers NOT extracted as artists (e.g., "Trọng Hiếu")
- [ ] Performance types detected (solo/duet/medley/group)
- [ ] Tone normalized to "Nam" or "Nữ"

### **Database Tests:**
- [ ] Songs have clean titles
- [ ] `artist_name` populated where applicable
- [ ] `performance_type` set correctly
- [ ] Groups have clean `base_title_display`
- [ ] No duplicate entries created
- [ ] Files link to correct versions

### **Integration Tests:**
- [ ] Watch mode works (new downloads get cleaned)
- [ ] Scan mode works (backfill existing)
- [ ] No errors in logs
- [ ] Healthcheck still passes

---

## 🚨 Rollback Plan

If something breaks:

1. **Restore backups:**
   ```bash
   cd Controller
   cp parseFilename-backup.js parseFilename.js
   cp dbUpsert-backup.js dbUpsert.js
   cp rules-backup.js rules.js
   ```

2. **Restart controller:**
   ```bash
   docker restart karaoke-node
   ```

3. **Check logs:**
   ```bash
   docker logs karaoke-node
   ```

---

## 📊 Expected Improvements

### **Before (Original):**
```json
{
  "title": "｜ Khi Nao Chau Duong ｜ Chuan",
  "tone": "nam",
  "mixer": null,
  "style": null,
  "artist_name": null,
  "performance_type": null
}
```

### **After (Enhanced):**
```json
{
  "title": "Khi Nao Chau Duong",
  "tone": "Nam",
  "channel": null,
  "style": null,
  "artist_name": null,
  "performance_type": "solo"
}
```

### **For English song:**
```json
{
  "title": "Whiplash",
  "tone": null,
  "channel": null,
  "style": null,
  "artist_name": "Aespa",
  "performance_type": "solo"
}
```

---

## 🎯 Next Steps

Once testing is complete:

1. **Deploy to TrueNAS:**
   - Update Docker container with enhanced code
   - Test watch mode with a new download
   - Verify healthcheck passes

2. **Backfill existing data:**
   - Run `MODE=scan` to re-index all videos
   - Or use webapp's `tsx scripts/index-songs.ts` (also enhanced)

3. **Monitor:**
   - Check logs for any errors
   - Verify new downloads get clean data
   - Test webapp search and version display

---

## 📞 Troubleshooting

### **Tests fail:**
- Check Node.js version (needs ES modules support)
- Ensure `remove-accents` package installed: `npm install`
- Check syntax errors in enhanced files

### **Parser returns wrong values:**
- Add console.log() in parseFilename-enhanced.js
- Check rules-enhanced.js patterns
- Test with specific filename: `node -e "import..."`

### **Database writes fail:**
- Check Supabase connection in `.env`
- Verify `artist_name` and `performance_type` columns exist
- Check error messages in logs

---

## 🎉 Success Criteria

You'll know it's working when:

✅ Unit tests pass  
✅ Parser cleans titles correctly  
✅ Artists extracted where possible  
✅ Mixers NOT extracted as artists  
✅ Performance types detected  
✅ Database writes succeed  
✅ Webapp shows clean data  
✅ No errors in logs  
✅ Healthcheck passes

**Happy testing!** 🚀
