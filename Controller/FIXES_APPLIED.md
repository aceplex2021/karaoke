# FIXES APPLIED TO ENHANCED PARSER

**Date:** January 17, 2026

## ✅ Fixes Applied

### 1. **Title Cleanup Improvements**
- ✅ Remove file suffixes (`.f298`, hash suffixes like `ce67b638c`)
- ✅ Remove trailing metadata patterns (`__nam`, `__nu`)
- ✅ Remove trailing dots and underscores
- ✅ Remove double dashes (`- -`)
- ✅ Better pipe handling (prefer song title after pipe when beforePipe is just "Karaoke...")
- ✅ Detect when afterPipe is just a mixer name and use beforePipe instead

### 2. **Tone Detection**
- ✅ Check filename directly for "tone nam/nu" patterns
- ✅ Check title for "tone nam/nu" patterns
- ✅ Normalize to "Nam" or "Nữ"

### 3. **Style Detection**
- ✅ Check base filename directly for "nhac song" / "nhạc sống"
- ✅ Multi-word style detection (nhac song, cha cha, etc.)
- ✅ Return "Nhạc Sống" as style when detected

### 4. **Channel/Mixer Detection**
- ✅ Extract from full filename (not just metadata)
- ✅ Improved mixer name detection in pipe handling

### 5. **Artist Extraction**
- ✅ Stop at pipes (don't include "Beat Chuẩn" etc.)
- ✅ Remove "Beat Chuẩn", "Song Ca" from artist names
- ✅ Handle Vietnamese artists with "ft" (featuring)
- ✅ Exclude "Karaoke", "Karaoke Version" from artist extraction

### 6. **Performance Type**
- ✅ "song ca" detected as duet
- ✅ "lien khuc" detected as medley (checked first)
- ✅ "hop ca" detected as group

### 7. **Title Extraction Logic**
- ✅ Better handling of pipes
- ✅ Prefer part after pipe if beforePipe is just "Karaoke..."
- ✅ Use beforePipe if afterPipe is just a mixer
- ✅ Fallback to cleaned rawTitle if needed

## 🔧 Remaining Issues to Test

Based on user feedback, these specific cases need verification:

1. **"chuyen dem mua & dau ky niem"** - Title should be clean (remove .f298) ✅
2. **"Ben song cho"** - Need mixer "Trọng Hiếu", tone "Nam" ✅
3. **"Tinh xa"** - Need tone "Nam" ✅
4. **"Nguoi tinh khong den"** - Should be medley, correct title ✅
5. **"cu ngo hanh phuc that gan"** - Should be duet, need artist ✅
6. **"dinh menh"** - Need tone "Nam" ✅
7. **"Do sang ngang"** - Need style "Nhạc Sống", mixer "Trọng Hiếu" ✅
8. **"Nu cuoi biet ly"** - Correct title ✅
9. **"Diem xua"** - Correct title ✅
10. **"Ve xu nghe cung anh"** - Need style "Nhạc Sống", mixer "Trọng Hiếu" ✅
11. **"Xom dem"** - Need tone "Nam" ✅
12. **"Pho dem"** - Correct title, tone "Nữ" ✅
13. **"Bai khong ten so 2"** - Correct title, remove "Tone NỮ" ✅
14. **"Hoa khuc tuong tu"** - Artist should be "Minh Vương M4U ft Thương Võ" (no "Beat Chuẩn") ✅
15. **"Ha tien"** - Need tone "Nam" ✅
16. **"Hoa su nha nang"** - Correct title, mixer "Trọng Hiếu", style "song_ca" ✅
17. **"Khi"** - Correct title (remove trailing dot) ✅

## 🧪 Next Steps

Run the test again:
```bash
node test-from-database.js 20
```

Review all 20 files and identify any remaining issues.
