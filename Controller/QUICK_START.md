# QUICK START - Test Enhanced Controller

## 🚀 3 Simple Commands

### 1. Unit Tests (30 seconds)
```bash
cd Controller
node test-enhanced.js
```
**Expected:** All 10 tests pass ✅

---

### 2. Test on Real Files (1 minute)
```bash
cd Controller
node index-test.js C:\path\to\your\videos 20
```
**Expected:** Clean titles, artists extracted, no errors ✅

---

### 3. Compare Old vs New (Optional)
```bash
cd Controller
node -e "import('./parseFilename.js').then(m => console.log('OLD:', m.parseFilename('｜ Khi Nao ｜ Chuan.mp4'))); import('./parseFilename-enhanced.js').then(m => console.log('NEW:', m.parseFilename('｜ Khi Nao ｜ Chuan.mp4')))"
```

---

## 📊 What to Check

✅ Titles clean (no pipes: ｜ or |)  
✅ "Nhac song" removed  
✅ English artists extracted (Aespa, Taylor Swift)  
✅ Vietnamese composers extracted ((Trinh Cong Son))  
✅ Mixers NOT as artists (Trọng Hiếu should be `channel`, not `artist`)  
✅ Performance types detected (solo/duet/medley/group)  
✅ Tone normalized ("Nam" or "Nữ", not "male" or "nu")

---

## ⚡ If Tests Pass

Continue to `TESTING_GUIDE.md` for full integration steps.

---

## 🚨 If Tests Fail

1. Check Node.js version: `node --version` (needs v14+)
2. Install dependencies: `npm install`
3. Check file paths in error messages
4. Read error details - they're helpful!

---

## 📝 Test Files Included

- `test-enhanced.js` - 10 unit tests
- `index-test.js` - Real file testing (no DB)
- `TESTING_GUIDE.md` - Full instructions
- `ENHANCED_CONTROLLER_COMPLETE.md` - Overview

---

## 🎯 Files Modified

**NEW (safe to test):**
- `rules-enhanced.js`
- `parseFilename-enhanced.js`
- `dbUpsert-enhanced.js`

**ORIGINAL (unchanged):**
- `rules.js`
- `parseFilename.js`
- `dbUpsert.js`

Both versions can coexist! Test the enhanced versions first.

---

## 💡 Quick Tip

The enhanced parser is a **pure function** - it just transforms strings. You can test it freely without touching the database:

```javascript
import { parseFilename } from './parseFilename-enhanced.js';
const result = parseFilename('Your Song Title.mp4');
console.log(result.title_clean);  // Clean title!
console.log(result.artist_name);  // Extracted artist!
```

**Start testing now! It's safe and easy!** 🚀
