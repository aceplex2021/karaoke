-- ============================================
-- EXTRACT ARTISTS FROM STORAGE_PATH
-- ============================================
-- Populates kara_songs.artist_name using aggressive extraction
-- Accepts NULL for songs where artist cannot be determined
-- Date: January 17, 2026
-- ============================================

BEGIN;

-- Create extraction function
CREATE OR REPLACE FUNCTION extract_artist_from_path(storage_path TEXT)
RETURNS TEXT AS $$
DECLARE
  filename TEXT;
  artist TEXT;
  parentheses_content TEXT;
BEGIN
  -- Extract filename from path
  filename := REGEXP_REPLACE(storage_path, '^.+/', '');
  filename := REGEXP_REPLACE(filename, '\.[^.]+$', ''); -- Remove extension
  
  -- PATTERN 1: English Artist - Song Format
  -- Examples: "Adele - Someone Like You", "Taylor Swift - Anti-Hero"
  IF filename ~ '^[A-Z][a-zA-Z]+(?: [A-Z][a-zA-Z]+){0,3}\s+-\s+' THEN
    artist := SUBSTRING(filename FROM '^([^-]+)\s+-\s+');
    artist := TRIM(artist);
    
    -- Clean up common patterns from extracted artist
    artist := REGEXP_REPLACE(artist, '\s*\(.*?\)\s*', ' ', 'g'); -- Remove parentheses
    artist := TRIM(artist);
    
    -- Exclude common false positives (genres, production terms)
    IF artist !~* '^(Karaoke|Beat|Slow Ballad|Rumba|Bolero|Bossa Nova|Cha Cha|Remix|Live|Version|Mix|Ballad|Band Version|Big Band|Production|Music Box|Standard|Official)' AND
       LENGTH(artist) > 0 AND LENGTH(artist) < 50 THEN
      RETURN artist;
    END IF;
  END IF;
  
  -- PATTERN 2: KARAOKE ｜ Song - Artist ｜ format
  -- Examples: "KARAOKE ｜ Song Title - Phan Duy Anh ｜ Beat"
  IF filename ~* '^karaoke\s*｜' THEN
    -- Extract text between first " - " and second "｜" or end
    artist := SUBSTRING(filename FROM ' - ([^｜]+)');
    IF artist IS NOT NULL THEN
      artist := TRIM(artist);
      
      -- Remove common suffixes
      artist := REGEXP_REPLACE(artist, '\s+(Cover|Mochiii|Beat|Tone|Official).*$', '', 'i');
      artist := TRIM(artist);
      
      IF LENGTH(artist) > 0 AND LENGTH(artist) < 50 THEN
        RETURN artist;
      END IF;
    END IF;
  END IF;
  
  -- PATTERN 3: ACV Karaoke ｜ Song - Artist ｜ format
  -- Examples: "ACV Karaoke ｜ Song - Khắc Việt ｜ Beat"
  IF filename ~* '^acv\s+(karaoke\s*)?｜' THEN
    artist := SUBSTRING(filename FROM ' - ([^｜]+)');
    IF artist IS NOT NULL THEN
      artist := TRIM(artist);
      artist := REGEXP_REPLACE(artist, '\s+(Cover|Beat|Tone|Official).*$', '', 'i');
      artist := TRIM(artist);
      
      IF LENGTH(artist) > 0 AND LENGTH(artist) < 50 THEN
        RETURN artist;
      END IF;
    END IF;
  END IF;
  
  -- PATTERN 4: Composer in Parentheses
  -- Examples: "Song Title (Phạm Duy) - Boston", "Song (Ngô Thụy Miên)"
  IF filename ~ '\([^)]+\)' THEN
    parentheses_content := SUBSTRING(filename FROM '\(([^)]+)\)');
    
    -- Exclude if it's a musical key, technical term, or production descriptor
    IF parentheses_content IS NOT NULL AND
       parentheses_content !~* '(^[A-G][#b]?m?$|^[A-G][#b]?/|Karaoke Version|Backing Track|^Tone|Major|Minor|Trưởng|Thứ|giáng|thăng|^DVD$|^CD$|Phối|Mix|Version|Remix|Beat|Ballad|^\d{4}|Chuẩn|Standard)' THEN
      
      artist := TRIM(parentheses_content);
      
      -- Only accept if it looks like a name (has at least one space or Vietnamese characters)
      IF LENGTH(artist) > 2 AND LENGTH(artist) < 50 AND
         (artist ~ '\s' OR artist ~ '[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ]') THEN
        RETURN artist;
      END IF;
    END IF;
  END IF;
  
  -- PATTERN 5: Vietnamese Artist at End (aggressive)
  -- Examples: "Song Title ｜ Artist Name" (NOT mixers!)
  -- NOTE: This pattern is currently DISABLED because names after ｜ are usually mixers, not artists
  -- Examples of MIXERS (excluded): Trọng Hiếu, Kim Quy, Nam Trân, Gia Huy, Công Trình
  IF filename ~ '｜\s*([A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ][a-zàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]+(?:\s+[A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ][a-zàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]+){0,2})\s*$' THEN
    artist := SUBSTRING(filename FROM '｜\s*([A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ][a-zàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]+(?:\s+[A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ][a-zàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]+){0,2})\s*$');
    IF artist IS NOT NULL THEN
      artist := TRIM(artist);
      
      -- Exclude mixers, production terms, and metadata keywords
      -- Common Vietnamese mixers: Trọng Hiếu, Kim Quy, Nam Trân, Gia Huy, Công Trình, Nhật Nguyễn, Thanh Tung
      IF artist !~* '^(Karaoke|Nhac Song|Beat|Beat Hay|Beat Chuan|Official|Tone|Nam|Nu|Ballad|Slow Ballad|Rumba|Bolero|Bossa Nova|Cha Cha|Remix|Live|Version|Mix|Phoi Chuan|Standard|Big Band|Band Version|Production|Music Box)' AND
         artist !~* '^(Trong Hieu|Trọng Hiếu|Kim Quy|Gia Huy|Nam Tran|Nam Trân|Tas Beat|Công Trình|Cong Trinh|Nhật Nguyễn|Nhat Nguyen|Thanh Tung|Karaoke Công Trình)' AND
         artist !~ '^\d{4}$' AND -- Not a year like "2025"
         LENGTH(artist) >= 3 AND LENGTH(artist) < 50 THEN
        RETURN artist;
      END IF;
    END IF;
  END IF;
  
  -- No pattern matched, return NULL
  RETURN NULL;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMIT;

-- Test the function on various patterns
SELECT 
  '=== ARTIST EXTRACTION TEST ===' as section,
  storage_path,
  extract_artist_from_path(storage_path) as extracted_artist
FROM kara_files
ORDER BY RANDOM()
LIMIT 50;

-- Statistics: How many artists can we extract?
SELECT 
  '=== EXTRACTION STATISTICS ===' as section,
  'Total files' as metric,
  COUNT(*) as count,
  '100%' as percentage
FROM kara_files
UNION ALL
SELECT 
  '',
  'Artist extracted',
  COUNT(*),
  ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM kara_files), 1) || '%'
FROM kara_files
WHERE extract_artist_from_path(storage_path) IS NOT NULL
UNION ALL
SELECT 
  '',
  'NULL (no artist)',
  COUNT(*),
  ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM kara_files), 1) || '%'
FROM kara_files
WHERE extract_artist_from_path(storage_path) IS NULL;

-- Sample extractions by pattern
SELECT 
  '=== ENGLISH ARTISTS ===' as section,
  extract_artist_from_path(storage_path) as artist,
  COUNT(*) as song_count
FROM kara_files
WHERE extract_artist_from_path(storage_path) ~ '^[A-Z][a-z]+(?: [A-Z][a-z]+){0,3}$'
  AND extract_artist_from_path(storage_path) !~ '[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ]'
GROUP BY extract_artist_from_path(storage_path)
ORDER BY COUNT(*) DESC
LIMIT 20;

SELECT 
  '=== VIETNAMESE ARTISTS ===' as section,
  extract_artist_from_path(storage_path) as artist,
  COUNT(*) as song_count
FROM kara_files
WHERE extract_artist_from_path(storage_path) IS NOT NULL
  AND extract_artist_from_path(storage_path) ~ '[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ]'
GROUP BY extract_artist_from_path(storage_path)
ORDER BY COUNT(*) DESC
LIMIT 20;
