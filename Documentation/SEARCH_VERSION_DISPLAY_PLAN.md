# SEARCH & VERSION DISPLAY IMPROVEMENTS

**Date:** January 17, 2026  
**Status:** Planning

---

## Problems Identified

### 1. Messy Song Titles in Database
Song titles (`kara_songs.title`) contain unwanted metadata:

**Common Issues:**
- Redundant metadata: "Nhac Song ｜ Trong Hieu" (mixer info already in filename)
- Path fragments: "Incoming/ Legacy/acv Videos/karaoke ｜ ..."
- Artist in title: "Kelly Clarkson White Christmas" (artist should be separate)
- Version info: "Tone Nữ", "Nhạc Sống", "2023", "HD"
- Quality descriptors: "Chat Luong Cao", "De Hat", "Moi De Hat"
- Production credits: "Diem Xua Productions", "Opus Convention"
- Pipe separators: "｜ Tran", "｜ Chuan"
- Hashtags: "#shorts"
- Special markers: "✦", "||"

**Examples:**
```
❌ Canh Thiep Dau Xuan Nhac Song ｜ Trong Hieu
✅ Canh Thiep Dau Xuan

❌ Incoming/ Legacy/mix Mua Chieu | | Nhac Song Phoi Moi...
✅ Mua Chieu

❌ Kelly Clarkson White Christmas
✅ White Christmas (artist: Kelly Clarkson)

❌ ｜ Em Dau Muon Thay Anh Buon Thuy Le ｜ Chuan
✅ Em Dau Muon Thay Anh Buon
```

### 2. Version Display Missing Key Info
Current version modal shows:
- ✅ Tone/Mixer label (e.g., "Nam - Hieu Organ")
- ❌ Missing: Artist name
- ❌ Missing: Style (Bolero, Nhạc Sống, etc.)

**Requested Format:**
```
Tone: Nam - Mixer: Hiếu Organ - Artist: Phạm Duy
```

---

## Proposed Approach

### Option A: Clean Database + Update Views (Recommended)
**Pros:**
- Permanent fix
- Improves search quality
- Cleaner data for all features
- Future-proof

**Cons:**
- Requires database migration
- Need to test thoroughly

**Steps:**
1. Create regex-based cleaning function in SQL
2. Update `kara_songs.title` and `base_title_unaccent`
3. Update search/detail views to parse artist from `storage_path`
4. Update frontend to display: Tone - Mixer - Artist
5. Test search results before/after

---

### Option B: Fix Frontend Only (Quick Fix)
**Pros:**
- No database changes
- Faster to implement

**Cons:**
- Messy titles still in DB
- Search quality unchanged
- Cleanup logic duplicated in frontend

**Not Recommended** - Band-aid solution

---

## Recommended: Option A Implementation Plan

### Phase 1: Investigate & Design Cleanup Rules
1. Analyze patterns in messy titles
2. Define regex cleaning rules
3. Test on sample data (spot check 20-30 songs)

### Phase 2: Create Cleanup Script
```sql
-- Patterns to remove:
1. Pipe separators and everything after: ｜.*$
2. Path fragments: ^Incoming/.*?Videos/
3. Metadata keywords: 
   - (Nhac Song|Nhạc Sống)
   - (Tone Nam|Tone Nữ|Tone Nu)
   - (Chat Luong Cao|De Hat|Moi De Hat)
   - \\d{4}$ (years at end)
   - (HD|4K)$
   - #\\w+$ (hashtags)
4. Leading/trailing separators: ^[\\s|-|–]+|[\\s|-|–]+$
5. Multiple spaces: \\s{2,}
```

### Phase 3: Update Database Views
Modify `kara_song_versions_detail_view` to:
- Extract `artist` from `storage_path` more reliably
- Extract `style` (Bolero, Ballad, Nhạc Sống, etc.) from filename

### Phase 4: Update Frontend Display
Modify `VersionSelectorModal` to show:
```tsx
// Instead of just: "Nam - Hiếu Organ"
// Show: "Tone: Nam - Mixer: Hiếu Organ - Artist: Phạm Duy"
```

---

## Next Steps - Your Decision

**How would you like to proceed?**

### Option 1: Sample-Based Approach (Recommended)
1. I'll show you 20 sample titles with proposed cleaned versions
2. You approve/adjust the cleaning rules
3. I'll run the cleanup on full database
4. Test search to confirm improvements

### Option 2: Full Auto-Clean
1. I'll create comprehensive regex cleanup script
2. Run it with full backup
3. Show before/after comparison

### Option 3: Manual Review
1. Export all unique messy patterns
2. You manually define rules for each
3. I implement your exact specifications

---

## Impact Assessment

**Search Quality Improvement:**
- Before: "nhac song nua bai ｜ lien khuc nhac tru tinh song ca..." (75 chars)
- After: "Nua Bai" (7 chars, clean)
- Result: More accurate search, better deduplication

**Version Display:**
- Before: "Nam - Hiếu Organ" (missing artist)
- After: "Tone: Nam - Mixer: Hiếu Organ - Artist: Phạm Duy"
- Result: Complete metadata at a glance

---

## Questions for You

1. **Cleanup approach:** Sample-based (Option 1), Full auto-clean (Option 2), or Manual (Option 3)?
2. **Artist extraction:** Should we extract English artist names from titles (e.g., "Kelly Clarkson White Christmas") or leave as-is?
3. **Version display format:** Do you want "Tone: Nam - Mixer: X - Artist: Y" or just "Nam - X - Y" (shorter)?

Let me know and I'll proceed!
