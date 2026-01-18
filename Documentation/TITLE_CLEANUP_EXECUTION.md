## 🎯 Ready to Execute Title Cleanup

**Date:** January 17, 2026  
**Status:** Ready for execution

---

## ✅ Test Results

**Test completed successfully!**

| Metric | Value |
|--------|-------|
| Total songs | 8,357 |
| Songs to clean | 6,633 (79%) |
| Average chars removed | 30.3 |
| Estimated time | ~30 seconds |

### Sample Results

**Before:**
```
Incoming/ Legacy/mix Mua Chieu | | Nhac Song.../noi Dau Muon Mang ✦ Am Thanh Chuan ｜ Yeu Ca Hat Love Singing ｜ Sol Thu
```

**After:**
```
Noi Dau Muon Mang
```

**Saved:** 134 characters!

---

## 📋 Execution Steps

### Step 1: Add artist_name Column
```bash
psql $DATABASE_URL -f database/add_artist_name_column.sql
```

**Expected output:**
```
ALTER TABLE
CREATE INDEX
COMMENT
```

### Step 2: Run Title Cleanup (with preview)
```bash
psql $DATABASE_URL -f database/clean_song_titles.sql
```

**This will:**
1. Create backup table (`kara_songs_backup_20260117_title_cleanup`)
2. Show preview of 30 songs (before/after)
3. Show statistics
4. **WAIT** for your approval (UPDATE is commented out)

### Step 3: Review Preview

Look at the output and verify:
- ✅ Titles look correct
- ✅ No important data lost
- ✅ English song titles preserved

### Step 4: Uncomment and Execute UPDATE

**If preview looks good:**

Edit `database/clean_song_titles.sql` and uncomment lines 112-147 (the UPDATE section), then run again:

```bash
psql $DATABASE_URL -f database/clean_song_titles.sql
```

---

## 🔒 Safety Features

1. **Backup table created** before any changes
2. **Preview shown** before execution
3. **Empty titles prevented** (< 3 chars returns original)
4. **Transaction wrapped** (can rollback if needed)
5. **Rollback available**:
   ```sql
   -- If something goes wrong:
   BEGIN;
   UPDATE kara_songs s
   SET title = b.title,
       base_title_unaccent = b.base_title_unaccent
   FROM kara_songs_backup_20260117_title_cleanup b
   WHERE s.id = b.id;
   COMMIT;
   ```

---

## 📊 What Gets Cleaned

| Category | Example | Result |
|----------|---------|--------|
| Pipe separators | `Dem Tam Su ｜ Trong Hieu` | `Dem Tam Su` |
| Path fragments | `Incoming/.../karaoke Mua Chieu` | `Mua Chieu` |
| "Nhac Song" | `Vui Tet Nhac Song` | `Vui Tet` |
| Tone indicators | `Em Ve Mua Thu Soprano` | `Em Ve Mua Thu` |
| Quality terms | `De Hat Am Thanh Chuan` | `` (removed) |
| Song types | `Dap Mo Cuoc Tinh Rumba` | `Dap Mo Cuoc Tinh` |
| Production | `(Karaoke Version)` | `` (removed) |
| Special chars | `#shorts`, `✦` | `` (removed) |

---

## ✅ After Cleanup

**What happens next:**
1. Search results will show clean titles
2. Version display will be cleaner
3. Artist extraction (Phase 2) can begin
4. Database views auto-update (no changes needed)

---

## 🚀 Ready to Go?

Run Step 1 and Step 2, review the preview, then let me know if you want to proceed with the actual UPDATE!

**Commands again:**
```bash
# Step 1: Add column
psql $DATABASE_URL -f database/add_artist_name_column.sql

# Step 2: Preview cleanup
psql $DATABASE_URL -f database/clean_song_titles.sql
```
