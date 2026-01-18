# NODE CONTROLLER MIGRATION GUIDE

**Goal:** Move all cleanup logic from manual SQL scripts into your node controller

---

## 📋 Overview

Your current setup:
```
MeTube → /Videos/Incoming → Node Controller → /Videos → Supabase
```

What needs to change:
- Node controller's `parseFilename()` function needs all the cleanup logic
- Database writes should use cleaned data
- No more manual SQL cleanup needed

---

## 🔧 Step 1: Locate Your Node Controller Code

Your node controller is running in a TrueNAS docker container. You need to:

1. Find the main ingestion script (likely similar to `scripts/index-songs.ts`)
2. Locate the `parseFilename()` or similar function that extracts metadata

---

## 📝 Step 2: Copy Cleanup Functions

From the enhanced `scripts/index-songs.ts`, copy these functions into your node controller:

### **Required Functions:**
```typescript
// 1. Title cleanup (removes pipes, noise words)
function cleanTitle(rawTitle: string): string

// 2. Artist extraction (from storage_path patterns)
function extractArtist(storagePath: string): string | undefined

// 3. Performance type detection
function detectPerformanceType(title: string, versionLabel: string): string

// 4. Tone cleaning (normalize to Nam/Nữ)
function cleanTone(rawLabel: string): string | undefined

// 5. Channel extraction (Vietnamese mixers)
function extractChannel(rawLabel: string): string | undefined

// 6. Style extraction (Beat, Bolero, etc.)
function extractStyle(rawLabel: string): string | undefined
```

All these functions are **pure functions** - they just take strings and return cleaned strings. No database dependencies!

---

## 🎯 Step 3: Update Your parseFilename() Function

### **Before (typical structure):**
```typescript
function parseFilename(storagePath: string) {
  const filename = basename(storagePath, extname(storagePath));
  
  // Basic metadata extraction
  const metadataMatch = filename.match(/(.+?)\s*[\[\(](.+?)[\]\)]/);
  const baseTitle = metadataMatch ? metadataMatch[1] : filename;
  
  return {
    storage_path: storagePath,
    title: baseTitle,  // ❌ Raw, uncleaned
    // Missing: artist, performance_type, clean tone, etc.
  };
}
```

### **After (with cleanup):**
```typescript
function parseFilename(storagePath: string) {
  const filename = basename(storagePath, extname(storagePath));
  
  // Extract raw metadata
  const metadataMatch = filename.match(/(.+?)\s*[\[\(](.+?)[\]\)]/);
  const rawTitle = metadataMatch ? metadataMatch[1] : filename;
  const rawMetadata = metadataMatch ? metadataMatch[2] : '';
  
  // ✅ Apply cleanup
  const baseTitle = cleanTitle(rawTitle);
  const artist = extractArtist(storagePath);
  const tone = cleanTone(rawMetadata);
  const channel = extractChannel(rawMetadata);
  const style = extractStyle(rawMetadata);
  
  // Build version label
  const labelParts = [];
  if (tone) labelParts.push(tone);
  if (channel) labelParts.push(channel);
  if (style) labelParts.push(style);
  const versionLabel = labelParts.length > 0 
    ? labelParts.join('_').toLowerCase() 
    : 'default';
  
  // Detect performance type
  const performanceType = detectPerformanceType(baseTitle, versionLabel);
  
  return {
    storage_path: storagePath,
    title: baseTitle,              // ✅ Clean!
    artist_name: artist,           // ✅ Extracted!
    performance_type: performanceType, // ✅ Detected!
    tone,                          // ✅ Normalized!
    channel,                       // ✅ Extracted!
    style,                         // ✅ Extracted!
    version_label: versionLabel,
  };
}
```

---

## 💾 Step 4: Update Database Writes

Make sure your node controller writes the cleaned data:

### **When inserting songs:**
```typescript
await supabaseAdmin.from('kara_songs').insert({
  title: parsedFile.title,                    // Already clean
  base_title_unaccent: unaccent(parsedFile.title),
  artist_name: parsedFile.artist_name,        // Already extracted
  performance_type: parsedFile.performance_type, // Already detected
});
```

### **When inserting song groups:**
```typescript
await supabaseAdmin.from('kara_song_groups').insert({
  base_title_display: parsedFile.title,       // Already clean
  base_title_unaccent: parsedFile.base_title_unaccent,
});
```

---

## 🧪 Step 5: Test on Existing Data

### **Option A: Re-index Everything (Recommended)**
```bash
# Run the enhanced indexer from this webapp repo
tsx scripts/index-songs.ts /mnt/HomeServer/Media/Music/Karaoke/Videos
```

This will:
- ✅ Skip files already in database
- ✅ Update songs missing artist_name or performance_type
- ✅ Apply all cleanup logic

### **Option B: Test on a Few Files**
1. Pick 5-10 test files
2. Delete their entries from database
3. Run node controller to re-index them
4. Verify data is clean in Supabase

---

## 🎯 Step 6: Deploy to TrueNAS

Once you've updated your node controller code:

1. **Build updated Docker image:**
   ```bash
   docker build -t karaoke-node:latest .
   ```

2. **Update TrueNAS container:**
   - Stop existing container
   - Deploy new image
   - Start container

3. **Verify watch mode works:**
   - Drop a test file into `/Videos/Incoming`
   - Check logs: should see cleaned metadata
   - Verify database: should have clean title, artist, performance_type

---

## ✅ Verification Checklist

After deployment:

- [ ] **Title cleanup works**
  - Search for songs that had pipes → pipes should be gone
  - Search results should be clean

- [ ] **Artist extraction works**
  - Check English songs (e.g., "Aespa Whiplash") → `artist_name` should be "Aespa"
  - Check Vietnamese songs with composers → should extract from parentheses

- [ ] **Performance type works**
  - Songs with "lien khuc" → `performance_type` = "medley"
  - Songs with "song ca" → `performance_type` = "duet"
  - Normal songs → `performance_type` = "solo"

- [ ] **Version metadata works**
  - Tone should be "Nam" or "Nữ" (not "male", "nu", etc.)
  - Channel should show Vietnamese mixer names
  - Style should show music genres

- [ ] **New downloads work**
  - Download a new video via MeTube
  - Node controller should auto-promote with clean metadata
  - No manual cleanup needed

---

## 🚨 Rollback Plan

If something breaks:

1. **Keep old SQL cleanup scripts** as backup
2. **Test thoroughly** before deleting them
3. **Can always re-run** enhanced indexer from webapp repo

---

## 📞 Need Help?

The enhanced `scripts/index-songs.ts` in this repo is your reference implementation. All the cleanup functions are there, fully tested and working.

You can:
1. Copy functions directly from that file
2. Use it as a reference for your node controller
3. Run it as a one-time migration to clean existing data

---

## 🎉 Expected Result

**Before:**
- Manual SQL cleanup after every index
- Inconsistent data quality
- Hard to maintain

**After:**
- One indexing script with all cleanup built-in
- Consistent, clean data automatically
- No manual intervention needed
- Node controller is the single source of truth

**Clean data in, clean data out!** 🚀
