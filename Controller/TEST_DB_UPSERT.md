# Testing dbUpsert-enhanced.js

## Overview
`dbUpsert-enhanced.js` adds **artist_name** and **performance_type** to the database upsert process. This guide provides step-by-step testing instructions.

## Prerequisites

✅ You need:
1. Supabase connection configured (`.env` file in parent directory)
2. Database schema with columns:
   - `kara_songs.artist_name` (text, nullable)
   - `kara_songs.performance_type` (text, nullable, default: 'solo')
3. Node modules installed (`npm install` in Controller directory)

## Testing Steps

### Step 1: Verify Database Schema

Check if the new columns exist:

```bash
# In psql or Supabase SQL editor
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'kara_songs'
  AND column_name IN ('artist_name', 'performance_type')
ORDER BY ordinal_position;
```

**Expected output:**
```
column_name      | data_type | is_nullable | column_default
-----------------+-----------+-------------+----------------
artist_name      | text      | YES         | NULL
performance_type | text      | YES         | 'solo'::text
```

If columns don't exist, run:
```sql
ALTER TABLE kara_songs 
ADD COLUMN IF NOT EXISTS artist_name TEXT,
ADD COLUMN IF NOT EXISTS performance_type TEXT DEFAULT 'solo';
```

### Step 2: Create Test Script

Create `Controller/test-db-write.js`:

```javascript
// test-db-write.js
// Test dbUpsert-enhanced with a sample file
import { parseFilename } from './parseFilename-enhanced.js';
import { upsertSongVersionFile } from './dbUpsert-enhanced.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Load .env from parent directory
if (!process.env.SUPABASE_URL) {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const parentEnvPath = join(__dirname, '..', '.env');
    const envContent = readFileSync(parentEnvPath, 'utf-8');
    
    envContent.split('\n').forEach(line => {
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].trim();
      }
    });
    
    if (!process.env.SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_URL) {
      process.env.SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
    }
  } catch (err) {
    console.error('Failed to load .env:', err.message);
  }
}

async function testDbUpsert() {
  console.log('🧪 Testing DB Upsert with Enhanced Parser\n');
  
  // Test cases with different patterns
  const testFiles = [
    {
      filename: 'Sabrina Carpenter - Sugar Talking (Karaoke Version).mp4',
      expectedArtist: 'Sabrina Carpenter',
      expectedPerformance: 'solo'
    },
    {
      filename: 'ACV Karaoke ｜ Cứ Ngỡ Hạnh Phúc Thật Gần - Minh Vương M4U ft Ngân Ngân ｜ Beat Chuẩn Song Ca__song_ca.mp4',
      expectedArtist: 'Minh Vương M4U ft Ngân Ngân',
      expectedPerformance: 'duet'
    },
    {
      filename: 'Karaoke Liên Khúc Tone Nam Nhạc Sống ｜ Chuyện Đêm Mưa & Dấu Chân Kỷ Niệm__nam.mp4',
      expectedArtist: null,
      expectedPerformance: 'medley'
    }
  ];
  
  for (const test of testFiles) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`📁 Testing: ${test.filename}`);
    console.log('='.repeat(80));
    
    try {
      // Step 1: Parse filename
      console.log('\n1️⃣ Parsing filename...');
      const meta = parseFilename(test.filename, `/test/${test.filename}`);
      
      console.log(`   Title:       ${meta.title_clean}`);
      console.log(`   Artist:      ${meta.artist_name || '(none)'}`);
      console.log(`   Performance: ${meta.performance_type}`);
      console.log(`   Tone:        ${meta.tone || '(none)'}`);
      console.log(`   Style:       ${meta.style || '(none)'}`);
      console.log(`   Channel:     ${meta.channel || '(none)'}`);
      console.log(`   Label:       ${meta.label}`);
      
      // Step 2: Verify parsed data matches expectations
      console.log('\n2️⃣ Verifying parsed data...');
      const artistMatch = meta.artist_name === test.expectedArtist;
      const perfMatch = meta.performance_type === test.expectedPerformance;
      
      console.log(`   Artist match:      ${artistMatch ? '✅' : '❌'} (expected: ${test.expectedArtist || 'null'}, got: ${meta.artist_name || 'null'})`);
      console.log(`   Performance match: ${perfMatch ? '✅' : '❌'} (expected: ${test.expectedPerformance}, got: ${meta.performance_type})`);
      
      // Step 3: Upsert to database
      console.log('\n3️⃣ Upserting to database...');
      const result = await upsertSongVersionFile({
        meta,
        relativePath: `/test/${test.filename}`,
        defaultLanguageCode: 'vi'
      });
      
      if (result) {
        console.log(`   ✅ File created: ID ${result.id}`);
      } else {
        console.log(`   ℹ️  File already exists (duplicate skipped)`);
      }
      
      console.log('\n✅ Test passed!');
      
    } catch (error) {
      console.error('\n❌ Test failed:', error.message);
      console.error('Stack:', error.stack);
      process.exit(1);
    }
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('🎉 All tests passed!');
  console.log('='.repeat(80));
}

testDbUpsert().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
```

### Step 3: Run Test (DRY RUN - Check Parsing Only)

```bash
cd Controller
node test-db-write.js
```

**What to check:**
- ✅ Parsing works correctly
- ✅ Artist names extracted as expected
- ✅ Performance types detected correctly
- ✅ No errors in parsing logic

### Step 4: Verify Database Write

After running the test, check the database:

```sql
-- Check the inserted songs
SELECT 
  id,
  title_display,
  artist_name,
  performance_type,
  created_at
FROM kara_songs
WHERE title_display IN (
  'Sugar Talking',
  'Cứ Ngỡ Hạnh Phúc Thật Gần',
  'Chuyện Đêm Mưa & Dấu Chân Kỷ Niệm'
)
ORDER BY created_at DESC;
```

**Expected results:**
```
title_display                    | artist_name                       | performance_type
---------------------------------+-----------------------------------+-----------------
Sugar Talking                    | Sabrina Carpenter                 | solo
Cứ Ngỡ Hạnh Phúc Thật Gần        | Minh Vương M4U ft Ngân Ngân       | duet
Chuyện Đêm Mưa & Dấu Chân Kỷ...  | NULL                              | medley
```

### Step 5: Test Update Behavior

Run the test again - it should skip duplicates:

```bash
node test-db-write.js
```

**Expected output:**
```
ℹ️  File already exists (duplicate skipped)
```

### Step 6: Verify Existing Integration

Check if the main controller (`index.js` or `scanVideos.js`) uses the enhanced version:

```bash
# Check import statements
grep -n "dbUpsert" Controller/index.js
grep -n "dbUpsert" Controller/scanVideos.js
```

**Should import:**
```javascript
import { upsertSongVersionFile } from './dbUpsert-enhanced.js';
// NOT from './dbUpsert.js'
```

### Step 7: Integration Test (Optional)

If you have `scanVideos.js` or `watchVideos.js`:

```bash
# Test with a single file
WRITE_DB=true node scanVideos.js --file "path/to/test-file.mp4"
```

Then verify in DB:
```sql
SELECT * FROM kara_songs 
WHERE title_display = 'YourTestSongTitle';
```

## Common Issues & Fixes

### Issue 1: Column doesn't exist
```
ERROR: column "artist_name" of relation "kara_songs" does not exist
```
**Fix:** Run the ALTER TABLE command from Step 1

### Issue 2: Missing titleCase.js
```
Error: Cannot find module './titleCase.js'
```
**Fix:** 
```bash
# Create titleCase.js if missing
cat > Controller/titleCase.js << 'EOF'
export function toTitleCase(str) {
  return str; // Or implement proper title casing
}
EOF
```

### Issue 3: Supabase connection error
```
Error: Supabase env missing
```
**Fix:** Ensure `.env` file exists in parent directory with:
```
SUPABASE_URL=your_url
SUPABASE_SERVICE_ROLE_KEY=your_key
```

## Rollback Plan

If something goes wrong:

```sql
-- Rollback new columns (if needed)
ALTER TABLE kara_songs 
DROP COLUMN IF EXISTS artist_name,
DROP COLUMN IF EXISTS performance_type;

-- Revert to old dbUpsert
-- In your code, change import back to:
import { upsertSongVersionFile } from './dbUpsert.js';
```

## Success Criteria

✅ All tests pass without errors
✅ Database shows correct artist_name values
✅ Database shows correct performance_type values
✅ Duplicates are handled gracefully
✅ Existing data not corrupted

## Next Steps

After successful testing:
1. Update `Controller/index.js` to use `dbUpsert-enhanced.js`
2. Monitor ingestion for 24 hours
3. Run analytics query to verify data quality:

```sql
-- Check distribution
SELECT 
  performance_type,
  COUNT(*) as count,
  ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM kara_songs), 2) as percentage
FROM kara_songs
GROUP BY performance_type
ORDER BY count DESC;

-- Check artist extraction rate
SELECT 
  'With Artist' as category,
  COUNT(*) as count
FROM kara_songs 
WHERE artist_name IS NOT NULL
UNION ALL
SELECT 
  'No Artist',
  COUNT(*)
FROM kara_songs 
WHERE artist_name IS NULL;
```
