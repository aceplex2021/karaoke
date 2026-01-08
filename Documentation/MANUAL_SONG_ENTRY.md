# Manual Song Entry in Supabase

## For your test song:

**Decoded filename:** `BIỂN NHỚ - KARAOKE - Tone NAM ( Gm⧸Sol Thứ ).mp4`

## Steps to Add in Supabase:

1. **Go to Supabase Dashboard:**
   - https://supabase.com/dashboard/project/kddbyrxuvtqgumvndphi
   - Click **Table Editor** in left sidebar
   - Select `kara_songs` table

2. **Click "Insert row" or the "+" button**

3. **Fill in the fields:**

   | Field | Value | Notes |
   |-------|-------|-------|
   | `id` | (leave empty - auto-generated) | UUID will be generated |
   | `title` | `BIỂN NHỚ` | Song title (extracted from filename) |
   | `artist` | (leave NULL or empty) | Unknown from filename |
   | `language` | `vi` | Vietnamese |
   | `youtube_id` | (leave NULL) | Optional |
   | `file_path` | `BIỂN NHỚ - KARAOKE - Tone NAM ( Gm⧸Sol Thứ ).mp4` | **Exact filename** |
   | `duration` | (leave NULL) | Optional - can add later |
   | `created_at` | (leave empty - auto-generated) | Will be set automatically |

4. **Click "Save"**

## Important Notes:

- **`file_path` must match exactly** what's accessible via your media server
- Test URL: `http://10.0.19.10:8090/BIỂN NHỚ - KARAOKE - Tone NAM ( Gm⧸Sol Thứ ).mp4`
- The app will construct: `{MEDIA_SERVER_URL}/{file_path}`
- So: `http://10.0.19.10:8090/BIỂN NHỚ - KARAOKE - Tone NAM ( Gm⧸Sol Thứ ).mp4`

## Testing:

After saving, test the URL in your browser:
```
http://10.0.19.10:8090/BIỂN%20NHỚ%20-%20KARAOKE%20-%20Tone%20NAM%20%28%20Gm%E2%A7%B8Sol%20Th%E1%BB%A9%20%29.mp4
```

Or the decoded version (if your browser handles it):
```
http://10.0.19.10:8090/BIỂN NHỚ - KARAOKE - Tone NAM ( Gm⧸Sol Thứ ).mp4
```

## Quick SQL Alternative:

If you prefer SQL Editor instead of Table Editor:

```sql
INSERT INTO kara_songs (title, file_path, language)
VALUES (
    'BIỂN NHỚ',
    'BIỂN NHỚ - KARAOKE - Tone NAM ( Gm⧸Sol Thứ ).mp4',
    'vi'
);
```

Then run it in SQL Editor.

