# Final Queries Needed Before Implementation

## ✅ What We Know

From the schema analysis:
- Groups use `base_title_unaccent` for search
- Versions have `label` (tone/style), `key` (pitch), `is_default`
- Files link to versions via `version_id`
- Queue has no data (clean migration)
- Relationship: groups → members → songs → versions → files

## ❓ Remaining Questions

### Query 1: kara_songs Structure
```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'kara_songs'
ORDER BY ordinal_position;
```

**Why:** Need to know what fields exist (title, artist, language, etc.)

### Query 2: Sample Version Labels
```sql
SELECT DISTINCT label, COUNT(*) as count
FROM kara_versions
WHERE label IS NOT NULL
GROUP BY label
ORDER BY count DESC
LIMIT 20;
```

**Why:** Need to know actual tone/style values (nam, nu, remix, etc.)

### Query 3: Sample File Types
```sql
SELECT DISTINCT type, COUNT(*) as count
FROM kara_files
GROUP BY type
ORDER BY count DESC;
```

**Why:** Need to know if we should filter by `type = 'video'`

### Query 4: Complete Relationship Sample
```sql
SELECT 
  g.id as group_id,
  g.base_title_display,
  g.base_title_unaccent,
  s.id as song_id,
  s.title as song_title,
  v.id as version_id,
  v.label as version_label,
  v.key as version_key,
  v.is_default,
  f.id as file_id,
  f.storage_path,
  f.type as file_type,
  f.duration_seconds
FROM kara_song_groups g
LEFT JOIN kara_song_group_members m ON g.id = m.group_id
LEFT JOIN kara_songs s ON m.song_id = s.id
LEFT JOIN kara_versions v ON s.id = v.song_id
LEFT JOIN kara_files f ON v.id = f.version_id
WHERE g.id = (SELECT id FROM kara_song_groups LIMIT 1)
ORDER BY v.is_default DESC, v.label;
```

**Why:** See complete data flow for one group

### Query 5: Artist Relationship (if exists)
```sql
-- Check if kara_songs has artist_id or artist field
SELECT column_name 
FROM information_schema.columns
WHERE table_name = 'kara_songs' 
AND column_name LIKE '%artist%';

-- Or check kara_artists table structure
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'kara_artists'
ORDER BY ordinal_position;
```

**Why:** Need to know how to get artist names for search results

### Query 6: Multiple Files Per Version?
```sql
SELECT 
  version_id,
  COUNT(*) as file_count,
  STRING_AGG(type, ', ') as file_types
FROM kara_files
GROUP BY version_id
HAVING COUNT(*) > 1
LIMIT 10;
```

**Why:** Need to know if we should pick specific file type or use all

## 🎯 After These Queries

Once we have these answers, we can:
1. Write the exact SQL for group-aware search
2. Implement best_version selection logic
3. Build play_url correctly
4. Update queue schema and logic

## 📝 Quick Test Query

To verify the relationship chain works:

```sql
-- Find a group with multiple versions
SELECT 
  g.base_title_display,
  COUNT(DISTINCT v.id) as version_count,
  COUNT(DISTINCT f.id) as file_count
FROM kara_song_groups g
JOIN kara_song_group_members m ON g.id = m.group_id
JOIN kara_songs s ON m.song_id = s.id
JOIN kara_versions v ON s.id = v.song_id
JOIN kara_files f ON v.id = f.version_id
WHERE f.type = 'video'  -- Assuming we want video files
GROUP BY g.id, g.base_title_display
HAVING COUNT(DISTINCT v.id) > 1
LIMIT 5;
```

This will show groups that have multiple versions (good for testing version selection).

