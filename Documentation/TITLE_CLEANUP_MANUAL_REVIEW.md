# SONG TITLE CLEANUP - MANUAL REVIEW

**Date:** January 17, 2026  
**Total Songs:** 8,357  
**Songs Needing Cleanup:** ~5,783 (69%)

---

## SUMMARY STATISTICS

| Pattern | Count | % of Database |
|---------|-------|---------------|
| **Pipe separators (｜)** | 4,826 | 58% |
| **"Nhac Song" keyword** | 2,895 | 35% |
| **English Artist + Song** | 2,412 | 29% |
| **Path fragments** | 957 | 11% |
| **Tone indicators** | 278 | 3% |

---

## CATEGORY 1: PIPE SEPARATORS (｜) - **4,826 songs**

### Pattern
Titles contain `｜` separator with metadata after it.

### Examples
```
❌ Canh Thiep Dau Xuan Nhac Song ｜ Trong Hieu
❌ Dem Tam Su ｜ Nhac Song Chat Luong Cao ｜ Cong Trinh
❌ ｜ Nhuong Nguoi Den Sau Ngan Ngan ｜
❌ Khoc Tham ｜ Nhan Ktv
❌ Quang Dung ｜ Khi ｜ Music Box #16
```

### Proposed Rule
**Remove everything from first `｜` to end of title**

### Test Cases
```
Input:  "Canh Thiep Dau Xuan Nhac Song ｜ Trong Hieu"
Output: "Canh Thiep Dau Xuan Nhac Song"

Input:  "｜ Nhuong Nguoi Den Sau Ngan Ngan ｜"
Output: "Nhuong Nguoi Den Sau Ngan Ngan"

Input:  "Dem Tam Su ｜ Nhac Song Chat Luong Cao ｜ Cong Trinh"
Output: "Dem Tam Su"
```

✅ **APPROVE THIS RULE?** (Yes/No/Modify):

---

## CATEGORY 2: PATH FRAGMENTS - **957 songs**

### Pattern
Titles start with filesystem paths like `Incoming/`, `Legacy/`, `Quarantine/`.

### Examples
```
❌ Incoming/ Legacy/mix Mua Chieu | | Nhac Song Phoi Moi De Hat Thanh Tung Official/mua Chieu ｜｜ Nhac Song Phoi Moi De Hat Thanh Tung
❌ Incoming/ Legacy/acv Videos/karaoke ｜ Em Chi So Ngay Mai Mochiii ｜ Chuan
❌ Quarantine/sing King Videos/emotional Ballads ｜ Perfect, Fix You, Vienna...
```

### Proposed Rule
**Remove everything up to and including last `/` before actual title**

### Test Cases
```
Input:  "Incoming/ Legacy/mix Mua Chieu | | Nhac Song.../karaoke Mua Chieu Tone L..."
Output: "karaoke Mua Chieu Tone L..."  
Then apply other rules to clean "karaoke", "Tone", etc.

Input:  "Incoming/ Legacy/acv Videos/karaoke ｜ Em Chi So Ngay Mai Mochiii ｜ Chuan"
Output: "karaoke ｜ Em Chi So Ngay Mai Mochiii ｜ Chuan"
Then apply pipe rule to get: "karaoke"
Then apply "karaoke" keyword removal to get: "Em Chi So Ngay Mai Mochiii"
```

✅ **APPROVE THIS RULE?** (Yes/No/Modify):

---

## CATEGORY 3: "NHAC SONG" / "NHẠC SỐNG" - **2,895 songs**

### Pattern
Titles contain these phrases which mean "live music" (referring to mixer/style, not song title).

### Examples
```
❌ Vui Tet Miet Vuon Nhac Song ｜ Trong Hieu
❌ Thuyen Hoa Nhac Song ｜ Trong Hieu
❌ Lien Khuc Nhac Song Nua Bai ｜ Lien Khuc Nhac Tru Tinh...
```

### Proposed Rule
**Remove "Nhac Song" and "Nhạc Sống" (case-insensitive)**

### Test Cases
```
Input:  "Vui Tet Miet Vuon Nhac Song"
Output: "Vui Tet Miet Vuon"

Input:  "Nhac Song Lien Khuc Tru Tinh"
Output: "Lien Khuc Tru Tinh"
```

✅ **APPROVE THIS RULE?** (Yes/No/Modify):

---

## CATEGORY 4: TONE INDICATORS - **278 songs**

### Pattern
Titles end with tone indicators (Soprano, Tenor, Tone Nam, Tone Nu).

### Examples
```
❌ Em Ve Mua Thu Soprano
❌ Yeu Em Vao Coi Chet Tenor
❌ Dung Xa Em Dem Nay Rumba Soprano Kim Quy
```

### Proposed Rule
**Remove these patterns at end of title:**
- `Soprano`
- `Tenor`
- `Tone Nam`
- `Tone Nu` / `Tone Nữ`
- `Kim Quy` (mixer name)
- `Sopranokimquy`, `Tenor Kim Quy`, etc.

### Test Cases
```
Input:  "Em Ve Mua Thu Soprano"
Output: "Em Ve Mua Thu"

Input:  "Dung Xa Em Dem Nay Rumba Soprano Kim Quy"
Output: "Dung Xa Em Dem Nay"  (also remove "Rumba")
```

✅ **APPROVE THIS RULE?** (Yes/No/Modify):

---

## CATEGORY 5: QUALITY/STYLE DESCRIPTORS - **High overlap with other categories**

### Pattern
Phrases describing quality or ease of singing.

### Examples
```
❌ Linh Hon Tuong Da Nhac Song Chat Luong Cao ｜ Trong Hieu
❌ Bai Ca Tet Cho Em Song Ca ｜ Moi De Hat Am Thanh Chuan ｜ Trong Hieu
❌ ｜ Anh Thua Anh Ta Ca Si Giau Mat ｜ De Hat
```

### Proposed Rule
**Remove these phrases (case-insensitive):**
- `Chat Luong Cao` / `Chất Lượng Cao` (high quality)
- `De Hat` / `Dễ Hát` (easy to sing)
- `Moi De Hat` / `Mới Dễ Hát` (new, easy to sing)
- `Am Thanh Chuan` / `Âm Thanh Chuẩn` (standard sound)
- `Beat Chuan` / `Beat Chuẩn` (standard beat)
- `Ca Si Giau Mat` / `Ca Sĩ Giấu Mặt` (masked singer)
- `HD`, `4K`
- `Chuan` / `Chuẩn` (standard)

### Test Cases
```
Input:  "Linh Hon Tuong Da Nhac Song Chat Luong Cao"
Output: "Linh Hon Tuong Da"

Input:  "Mua Chieu Nhac Song De Hat"
Output: "Mua Chieu"
```

✅ **APPROVE THIS RULE?** (Yes/No/Modify):

---

## CATEGORY 6: SONG TYPE DESCRIPTORS

### Pattern
Genre/type descriptors that aren't part of title.

### Examples
```
❌ Dap Mo Cuoc Tinh Nhac Song Rumba ｜ Trong Hieu
❌ Bai Thanh Ca Buon Slow Rock Kim Quy
❌ Acv Rumba ｜ Ho Dau Thuong Em Ngan Ngan ｜ Rumba
```

### Proposed Rule
**Remove these at end of title:**
- `Song Ca` (duet)
- `Lien Khuc` (medley)
- `Bolero`
- `Rumba`
- `Cha Cha Cha`
- `Slow`, `Slowrock`, `Slow Rock`
- `Ballad`
- `Bossa Nova`, `Bossanova`

### Test Cases
```
Input:  "Dap Mo Cuoc Tinh Nhac Song Rumba"
Output: "Dap Mo Cuoc Tinh"

Input:  "Bai Thanh Ca Buon Slow Rock"
Output: "Bai Thanh Ca Buon"
```

✅ **APPROVE THIS RULE?** (Yes/No/Modify):

---

## CATEGORY 7: PRODUCTION CREDITS

### Pattern
Production company/channel names.

### Examples
```
❌ Morgan Wallen I Ain't Comin' Back (feat. Post Malone) (Karaoke Version)
❌ Khoc Tham ｜ Nhan Ktv
❌ Taylor Swift - The Life Of A Showgirl (Backing Track Visualizer)
```

### Proposed Rule
**Remove these phrases:**
- `Karaoke Version`
- `Backing Track`
- `Backing Track Visualizer`
- `Official`
- `Music Box`
- `Ktv` / `KTV`
- `Productions`
- `feat.` and artist name in parentheses

### Test Cases
```
Input:  "Morgan Wallen I Ain't Comin' Back (feat. Post Malone) (Karaoke Version)"
Output: "Morgan Wallen I Ain't Comin' Back"

Input:  "Taylor Swift, Sabrina Carpenter The Life Of A Showgirl (Backing Track Visualizer)"
Output: "Taylor Swift, Sabrina Carpenter The Life Of A Showgirl"
```

✅ **APPROVE THIS RULE?** (Yes/No/Modify):

---

## CATEGORY 8: SPECIAL KEYWORDS

### Pattern
Other Vietnamese keywords that aren't part of song title.

### Examples
```
❌ Incoming/ Legacy/.../karaoke Mua Chieu Nhac Song Hay Nhat
```

### Proposed Rule
**Remove keyword "karaoke" at start of title (case-insensitive)**

### Test Cases
```
Input:  "karaoke Mua Chieu Nhac Song Hay Nhat"
Output: "Mua Chieu Nhac Song Hay Nhat"
Then apply other rules...
```

✅ **APPROVE THIS RULE?** (Yes/No/Modify):

---

## CATEGORY 9: ENGLISH ARTIST + SONG FORMAT - **2,412 songs**

### Pattern
Format: "Artist Name Song Title" (no separator)

### Examples
```
✅ CORRECT FORMAT (extract artist):
- Kelly Clarkson White Christmas → Artist: Kelly Clarkson, Title: White Christmas
- Adele Someone Like You → Artist: Adele, Title: Someone Like You
- Taylor Swift Anti-Hero → Artist: Taylor Swift, Title: Anti-Hero

❌ FALSE POSITIVES (Vietnamese, keep as-is):
- Ai Cho Toi Tinh Yeu (not English)
- Ai Len Xu Hoa Dao Rumba (not English)
```

### Proposed Rule
**Extract artist if:**
1. Title starts with capitalized English name (2-3 words max)
2. Followed by capitalized song title
3. No Vietnamese characters

**Regex:** `^([A-Z][a-z]+(?: [A-Z][a-z]+){0,2})\s+([A-Z].+)$`

### Test Cases
```
Input:  "Kelly Clarkson White Christmas"
Output: Title="White Christmas", Artist="Kelly Clarkson"

Input:  "Adele Someone Like You"
Output: Title="Someone Like You", Artist="Adele"

Input:  "Ai Cho Toi Tinh Yeu"  (Vietnamese)
Output: Title="Ai Cho Toi Tinh Yeu", Artist=NULL (no change)
```

✅ **APPROVE THIS RULE?** (Yes/No/Modify):

---

## CATEGORY 10: SPECIAL CHARACTERS

### Pattern
Hashtags, special symbols.

### Examples
```
❌ Joji Glimpse Of Us #shorts
❌ Can You Name All These Classic American Songs？ #america #music #guessthesong
❌ Noi Dau Muon Mang ✦ Am Thanh Chuan
```

### Proposed Rule
**Remove:**
- Hashtags: `#\w+`
- Special symbols: `✦`, `？` (full-width question mark)
- Multiple pipes: `｜｜` → single `｜` (then apply pipe rule)

### Test Cases
```
Input:  "Joji Glimpse Of Us #shorts"
Output: "Joji Glimpse Of Us"

Input:  "Noi Dau Muon Mang ✦ Am Thanh Chuan"
Output: "Noi Dau Muon Mang"  (also apply "Am Thanh Chuan" removal)
```

✅ **APPROVE THIS RULE?** (Yes/No/Modify):

---

## FINAL CLEANUP STEPS

After all rules applied:
1. Trim leading/trailing whitespace
2. Remove leading/trailing dashes (`-`, `–`)
3. Collapse multiple spaces to single space
4. Capitalize first letter of each word (title case)

---

## ORDER OF OPERATIONS

**IMPORTANT:** Rules must be applied in this order:

1. Remove path fragments (Category 2)
2. Remove pipe separators and everything after (Category 1)
3. Extract English artist if applicable (Category 9)
4. Remove "karaoke" prefix (Category 8)
5. Remove "Nhac Song" / "Nhạc Sống" (Category 3)
6. Remove quality descriptors (Category 5)
7. Remove tone indicators (Category 4)
8. Remove song type descriptors (Category 6)
9. Remove production credits (Category 7)
10. Remove special characters/hashtags (Category 10)
11. Final cleanup (trim, collapse spaces, title case)

---

## YOUR APPROVAL

Please review each category and reply with:

**Format:**
```
Category 1 (Pipe): YES
Category 2 (Path): YES
Category 3 (Nhac Song): YES
Category 4 (Tone): MODIFY - also remove "Slow Ballad"
Category 5 (Quality): YES
Category 6 (Song Type): YES
Category 7 (Production): YES
Category 8 (Karaoke): YES
Category 9 (English Artist): YES
Category 10 (Special Chars): YES
```

Or suggest modifications/additions for each category.

Once approved, I'll create the SQL cleanup script!
