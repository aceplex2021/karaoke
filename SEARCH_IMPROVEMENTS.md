# Search Improvements for Vietnamese/Latin Character Matching

## Current Issue

Searching for "Bien" (Latin) doesn't match "BIỂN" (Vietnamese with diacritics) because they're different Unicode characters. ILIKE is case-insensitive but doesn't handle character transliteration.

## Solutions

### Option 1: PostgreSQL unaccent Extension (Recommended)

This allows searching "Bien" to match "BIỂN" by removing diacritics.

**Setup:**
1. Enable the extension in Supabase SQL Editor:
```sql
CREATE EXTENSION IF NOT EXISTS unaccent;
```

2. Update the search to use unaccent:
```sql
-- Add a normalized search column
ALTER TABLE kara_songs ADD COLUMN IF NOT EXISTS title_normalized TEXT;
ALTER TABLE kara_songs ADD COLUMN IF NOT EXISTS artist_normalized TEXT;

-- Create function to update normalized columns
CREATE OR REPLACE FUNCTION update_normalized_columns()
RETURNS TRIGGER AS $$
BEGIN
  NEW.title_normalized = unaccent(lower(NEW.title));
  NEW.artist_normalized = unaccent(lower(COALESCE(NEW.artist, '')));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
CREATE TRIGGER update_song_normalized
  BEFORE INSERT OR UPDATE ON kara_songs
  FOR EACH ROW
  EXECUTE FUNCTION update_normalized_columns();

-- Update existing rows
UPDATE kara_songs 
SET title_normalized = unaccent(lower(title)),
    artist_normalized = unaccent(lower(COALESCE(artist, '')));
```

3. Update search to use normalized columns:
```typescript
// In src/server/routes/songs.ts
const normalizedTerm = searchTerm.toLowerCase(); // unaccent will be applied in query
query = query.ilike('title_normalized', `%${normalizedTerm}%`);
```

### Option 2: Store Both Versions

Store both Vietnamese and Latin versions in the database:
- `title`: "BIỂN NHỚ"
- `title_latin`: "BIEN NHO" (for search)

### Option 3: Client-Side Normalization

Use a JavaScript library to normalize search terms before sending to server.

## Quick Fix for Now

Users should search using:
- Vietnamese characters: "BIỂN" or "NHỚ"
- Partial matches: "BI" or "NH"
- Or use the actual characters from the song title

## Testing

After implementing unaccent:
- "Bien" should match "BIỂN"
- "nho" should match "NHỚ"
- "Bien nho" should match "BIỂN NHỚ"

