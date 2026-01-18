# VERSION DISPLAY ENHANCEMENT PLAN

**Date:** January 17, 2026  
**Goal:** Clean up and categorize version metadata display

---

## 📊 Current Data Analysis

### **Labels in Database (kara_versions.label):**
- `nam` - 2,434 (Male tone)
- `nu` - 1,592 (Female tone)
- `song_ca` - 915 (Duet)
- `nam_beat`, `nu_beat` - Beat versions
- `nam_bolero`, `nu_bolero` - Bolero style
- `nam_ballad`, `nu_ballad` - Ballad style
- `nam_remix` - Remix versions
- `original` - 2,322 (Original/Instrumental)

---

## 🎯 New Categorization System

### **Category 1: Performance Type** (NEW)
What we'll call it: **"Type"** or **"Performance"**

| Value | Display | Description |
|-------|---------|-------------|
| `solo` | Solo | Single performer |
| `song_ca` | Duet | Two performers |
| `hop_ca` | Group | Multiple performers |
| `lien_khuc` | Medley | Multiple songs |

**Detection Logic:**
- Label contains `song_ca` → Duet
- Title contains "Liên Khúc" or "Lien Khuc" → Medley
- Title contains "Hợp Ca" or "Hop Ca" → Group
- Default → Solo

---

### **Category 2: Tone** (CLEAN UP)
Keep only basic tone, remove style suffixes

| Current Label | Clean Tone |
|---------------|------------|
| `nam`, `nam_beat`, `nam_bolero`, `nam_ballad`, `nam_remix`, `nam_v2`, `nam_tram` | Nam |
| `nu`, `nu_beat`, `nu_bolero`, `nu_ballad`, `nu_v2`, `nu_tram` | Nữ |
| `original`, `beat`, `bolero`, `remix`, `ballad` | (none) |

---

### **Category 3: Channel/Mixer** (RENAME)
Rename "Mixer" to "Channel" for Vietnamese songs

**Current:** From `kara_files_parsed_preview.mixer`  
**Examples:** Trọng Hiếu, Kim Quy, Nam Trân, Công Trình

**Display:**
- If Vietnamese song → "Channel: Trọng Hiếu"
- If English song → Don't show (or "Channel: Official")

---

### **Category 4: Style** (EXTRACT FROM LABEL)
Extract style from label suffix

| Label Suffix | Style |
|--------------|-------|
| `_beat` | Beat |
| `_bolero` | Bolero |
| `_ballad` | Ballad |
| `_remix` | Remix |

---

## 🎨 New Display Format

### **Option A: Full Display**
```
Type: Solo | Tone: Nam | Channel: Trọng Hiếu | Style: Bolero | Artist: Đinh Tùng Huy
```

### **Option B: Compact Display**
```
Solo - Nam - Trọng Hiếu - Bolero - Đinh Tùng Huy
```

### **Option C: Categorized Display** (RECOMMENDED)
```
Performance: Solo
Vocal: Nam (Male)
Channel: Trọng Hiếu
Style: Bolero
Artist: Đinh Tùng Huy
```

---

## 🔧 Implementation Steps

### **Step 1: Add performance_type column**
```sql
ALTER TABLE kara_songs 
ADD COLUMN IF NOT EXISTS performance_type TEXT;

-- Possible values: 'solo', 'duet', 'group', 'medley'
```

### **Step 2: Create detection function**
```sql
CREATE OR REPLACE FUNCTION detect_performance_type(
  version_label TEXT,
  song_title TEXT
) RETURNS TEXT AS $$
BEGIN
  -- Check label first
  IF version_label ~* 'song.?ca' THEN
    RETURN 'duet';
  END IF;
  
  -- Check title
  IF song_title ~* 'lien.?khuc' THEN
    RETURN 'medley';
  END IF;
  
  IF song_title ~* 'hop.?ca' THEN
    RETURN 'group';
  END IF;
  
  -- Default
  RETURN 'solo';
END;
$$ LANGUAGE plpgsql IMMUTABLE;
```

### **Step 3: Populate performance_type**
```sql
UPDATE kara_songs s
SET performance_type = detect_performance_type(
  v.label,
  s.title
)
FROM kara_versions v
WHERE s.id = v.song_id;
```

### **Step 4: Update API response**
Add `performance_type`, clean `tone`, rename `mixer` → `channel`

### **Step 5: Update UI**
Display categories in clean, organized way

---

## 💭 Questions for User

1. **Performance Type label:** "Type", "Performance", or "Format"?
2. **Display style:** Full, Compact, or Categorized?
3. **Channel display:** Show for all songs or Vietnamese only?
4. **Should we extract Style from label?** (beat, bolero, ballad, remix)

---

**Reply with your preferences and I'll implement immediately!**
