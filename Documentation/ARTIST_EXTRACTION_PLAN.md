# ARTIST EXTRACTION - ANALYSIS & PLAN

**Date:** January 17, 2026  
**Total Files:** 11,727

---

## 📊 Path Pattern Analysis

| Pattern | Count | % | Example |
|---------|-------|---|---------|
| Has dash " - " | 6,274 | 53% | `Artist - Song Title` |
| Has parentheses | 5,796 | 49% | `Song (Composer/Key)` |
| Starts with "Karaoke" | 4,743 | 40% | `Karaoke Song Title` |
| English name at start | 566 | 5% | `Adele Someone Like You` |

---

## 🔍 Artist Extraction Patterns Identified

### **Pattern 1: English Artist - Song Format** (~2,500 files)
**Format:** `Artist Name - Song Title`

**Examples:**
```
✅ Sabrina Carpenter - Goodbye (Karaoke Version)
   Artist: Sabrina Carpenter
   
✅ Queen - I Want To Break Free (Karaoke Version)
   Artist: Queen
   
✅ Tate McRae - Just Keep Watching (Karaoke Version)
   Artist: Tate McRae
```

**Extraction Rule:**
- Must have ` - ` separator
- Must start with English capitalized name (1-3 words)
- Extract everything before first ` - `
- Remove `(Karaoke Version)` from extracted artist

---

### **Pattern 2: Vietnamese Composer in Parentheses** (~45-100 files)
**Format:** `Song Title (Composer Name)`

**Examples:**
```
✅ /Videos/NHƯ ĐÃ DẤU YÊU (Đức Huy) Ballad...
   Artist: Đức Huy
   
✅ /Videos/EM CÒN NHỚ MÙA XUÂN (Ngô Thuỵ Miên) Slow...
   Artist: Ngô Thuỵ Miên

✅ /Videos/ĐỪNG XA NHAU (Phạm Duy) - Boston...
   Artist: Phạm Duy
```

**Extraction Rule:**
- Has parentheses with Vietnamese name (not musical key)
- Extract name from parentheses
- Exclude if parentheses contain: keys (Am, Dm), "Karaoke Version", style descriptors

---

### **Pattern 3: KARAOKE ｜ Song - Artist Format** (~200 files)
**Format:** `KARAOKE ｜ Song Title - Artist ｜ ...`

**Examples:**
```
✅ KARAOKE ｜ Bỏ Lỡ Một Người - Châu Khải Phong ft Lê Chí Trung ｜ Beat Chuẩn
   Artist: Châu Khải Phong ft Lê Chí Trung
   
✅ KARAOKE ｜ Chẳng Màng Bận Tâm - Phan Duy Anh ｜ Mochiii Cover
   Artist: Phan Duy Anh
```

**Extraction Rule:**
- Starts with `KARAOKE ｜`
- Has ` - ` after song title
- Extract text between first ` - ` and second `｜`

---

### **Pattern 4: No Artist Info** (~5,000-6,000 files)
**Format:** `Karaoke Song Title Tone Nam...` (no separator)

**Examples:**
```
❌ /Videos/Karaoke Nhớ Người Yêu Tone Nữ Nhạc Sống...
   Artist: NULL (can't extract reliably)
   
❌ /Videos/Karaoke Trở Về Cát Bụi Tone Nam...
   Artist: NULL
```

**Extraction Rule:**
- Leave `artist_name` as NULL
- Will need manual population or different strategy

---

## 🎯 Proposed Extraction Logic

### **Order of Operations:**
1. **First, check Pattern 1** (English Artist - Song)
2. **Then, check Pattern 3** (KARAOKE ｜ Song - Artist)
3. **Then, check Pattern 2** (Composer in parentheses)
4. **Otherwise:** Leave as NULL

### **Why This Order?**
- Most specific to least specific
- Prevents false positives
- Maximizes accurate extractions

---

## 📊 Expected Results

| Pattern | Files | Artist Extracted | NULL |
|---------|-------|------------------|------|
| English Artist - Song | ~2,500 | 2,500 | 0 |
| KARAOKE ｜ Song - Artist | ~200 | 200 | 0 |
| Composer in parentheses | ~100 | 100 | 0 |
| No clear pattern | ~5,000 | 0 | 5,000 |
| **Total** | **11,727** | **~2,800** | **~5,000** |

**Success Rate:** ~40% auto-extraction, 60% need manual or alternative strategy

---

## 🤔 Questions for You

### **1. NULL Artists Acceptable?**
Is it OK if ~5,000 songs have `artist_name = NULL`? We can populate these later through:
- Manual entry
- Different extraction from clean `kara_songs.title` (now cleaned)
- Metadata from filename conventions

### **2. Composer = Artist?**
For Vietnamese songs with composer in parentheses (Phạm Duy, Ngô Thuỵ Miên):
- Should we store these as `artist_name`?
- Or leave NULL since composer ≠ performer?

### **3. False Positive Handling?**
Examples that might extract incorrectly:
```
⚠️ "Zhao Xi 朝夕【Day and Night】– JC-T..."
   Might extract: "Zhao Xi" (correct) or "Zhao Xi 朝夕" (wrong)
```

Should we be conservative (fewer extractions, more accurate) or aggressive (more extractions, some errors)?

---

## 🚀 Next Steps

**Once you answer the 3 questions above, I'll:**
1. Create the extraction SQL function
2. Test on 50 sample files
3. Show you before/after for approval
4. Execute the extraction

**Reply with your preferences for Questions 1-3!**
