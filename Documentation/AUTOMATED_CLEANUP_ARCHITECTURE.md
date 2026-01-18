# AUTOMATED DATA CLEANUP ARCHITECTURE

**Date:** January 17, 2026  
**Status:** New architecture - cleanup at ingestion time

---

## 🎯 Problem Statement

Previously, we had to run manual SQL cleanup scripts after indexing:
- ❌ Title cleanup (remove pipes, noise words)
- ❌ Artist extraction from filenames
- ❌ Performance type detection (solo/duet/medley/group)
- ❌ Version metadata parsing (tone, channel, style)

This was error-prone and easy to forget!

---

## ✅ New Architecture: Cleanup at Ingestion

**ALL cleanup now happens in the indexing script** (`scripts/index-songs.ts`)

### **Flow:**
```
MeTube downloads video
       ↓
/Videos/Incoming/*.mp4
       ↓
Node Controller watches directory
       ↓
Calls parseFilename() with ALL cleanup logic
       ↓
Writes clean data to Supabase
       ↓
Webapp reads clean data (no post-processing needed!)
```

---

## 🧹 Cleanup Functions Built Into Parser

### **1. Title Cleanup** (`cleanTitle()`)
Removes:
- Full-width pipes (｜) and regular pipes (|)
- Path fragments (`/Incoming/Legacy/...`)
- "Karaoke" prefix
- Noise words: "nhac song", "chat luong cao", "de hat", "chuan"
- Extra whitespace

**Example:**
```
Input:  "｜ Khi Nao Chau Duong ｜ Chuan"
Output: "Khi Nao Chau Duong"
```

---

### **2. Artist Extraction** (`extractArtist()`)
Patterns:
- **English**: "Aespa Whiplash" → Artist: "Aespa"
- **Vietnamese Composer**: "Tinh Don Phuong (Trinh Cong Son)" → Artist: "Trinh Cong Son"
- **KARAOKE format**: "KARAOKE | Dem Lanh - Dan Nguyen" → Artist: "Dan Nguyen"

**Exclusions:**
- Mixers: "Trọng Hiếu", "Kim Quy", "Gia Huy", etc.
- Production terms: "Karaoke", "Beat", "Official"
- Years: "2025", "2024"

---

### **3. Performance Type** (`detectPerformanceType()`)
Detects:
- **Duet**: version label contains "song ca"
- **Medley**: title contains "lien khuc" or "liên khúc"
- **Group**: title contains "hop ca" or "hợp ca"
- **Solo**: default for everything else

---

### **4. Tone Cleaning** (`cleanTone()`)
Normalizes:
- "nam", "male", "boy" → **"Nam"**
- "nu", "nữ", "female", "girl" → **"Nữ"**

---

### **5. Channel Extraction** (`extractChannel()`)
Identifies Vietnamese mixer/channel names:
- Trọng Hiếu
- Kim Quy
- Gia Huy
- Nam Trân
- Công Trình
- Nhật Nguyễn
- Thanh Tung

---

### **6. Style Extraction** (`extractStyle()`)
Detects music styles:
- Beat, Bolero, Ballad, Remix
- Rumba, Cha Cha, Tango, Valse
- Slow, Bossa Nova, Jazz, Blues, Rock, Pop

---

## 📊 Data Flow

### **Before (Manual):**
```
1. Index raw data → DB
2. Run manual SQL cleanup scripts
3. Hard refresh browser
4. Repeat for new songs
```

### **After (Automated):**
```
1. Index with cleanup → DB (clean data)
2. Done! ✅
```

---

## 🔧 Implementation

### **Core Function:**
```typescript
function parseFilename(storagePath: string): ParsedFile {
  // 1. Extract raw metadata from filename
  // 2. Clean title
  // 3. Extract artist
  // 4. Detect performance type
  // 5. Parse tone, channel, style
  // 6. Build version label
  
  return {
    base_title,           // Clean!
    artist_name,          // Extracted!
    performance_type,     // Detected!
    tone, channel, style, // Parsed!
    ...
  };
}
```

### **Database Write:**
```typescript
await supabaseAdmin.from('kara_songs').insert({
  title: file.base_title,           // Already clean
  artist_name: file.artist_name,    // Already extracted
  performance_type: file.performance_type, // Already detected
  ...
});
```

---

## 🎯 Benefits

### **For Node Controller:**
✅ Single source of truth for cleanup logic  
✅ Consistent data quality  
✅ No manual post-processing needed  
✅ Works for both backfill and live watch mode

### **For Webapp:**
✅ Always receives clean data  
✅ No client-side cleanup needed  
✅ Faster queries (no REGEXP at query time)  
✅ Better user experience

---

## 🚀 Deployment

### **For Existing Data:**
Run re-index to apply cleanup:
```bash
tsx scripts/index-songs.ts /mnt/HomeServer/Media/Music/Karaoke/Videos
```
- Skips files already in DB
- Updates songs with missing artist/performance_type
- Applies all cleanup logic

### **For New Downloads:**
Node controller automatically applies cleanup when promoting files from `/Incoming` to `/Videos`.

---

## 📝 Testing Checklist

After running enhanced indexer:

- [ ] Search for "khi" → titles should be clean (no pipes)
- [ ] Click "Versions" → should show Format, Tone, Channel, Style, Artist
- [ ] Check English songs → artist should be extracted (e.g., "Aespa")
- [ ] Check Vietnamese songs → composer should be extracted (e.g., "Trịnh Công Sơn")
- [ ] Check "lien khuc" → performance_type should be "medley"
- [ ] Check tone → should be "Nam" or "Nữ" (not "male" or "nu")

---

## 🔒 Architecture Principle

**"The database should only contain clean, processed data."**

- ❌ Don't store raw filenames and clean in queries
- ✅ Clean at ingestion, store clean data
- ❌ Don't parse filenames in webapp
- ✅ Parse in node controller, serve in API
- ❌ Don't run manual cleanup scripts
- ✅ Automate everything in the indexer

---

## 📂 Files Modified

- `scripts/index-songs.ts` - Enhanced with all cleanup functions
- `src/app/api/songs/group/[groupId]/versions/route.ts` - Already returns clean data
- `src/app/room/[code]/page.tsx` - Already displays enhanced version info

---

## 🎉 Result

**One script to rule them all!**

```bash
tsx scripts/index-songs.ts /path/to/videos
```

That's it. No more manual SQL cleanup. 🚀
