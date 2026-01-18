-- ============================================
-- FIX ORPHANED SONGS - Add to Groups
-- ============================================
-- Date: 2026-01-17
-- Issue: 67 songs not in any group
-- Solution: Add songs to existing groups OR create new groups
--
-- STRATEGY:
-- 1. If song matches existing group by base_title → add to that group
-- 2. If no match → create new group and add song to it
-- 
-- SAFETY: Runs in transaction, can rollback
-- ============================================

BEGIN;

-- ============================================
-- STEP 1: PRE-FLIGHT CHECK
-- ============================================

DO $$
DECLARE
  orphan_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO orphan_count
  FROM kara_songs s
  LEFT JOIN kara_song_group_members m ON s.id = m.song_id
  WHERE m.song_id IS NULL;
  
  RAISE NOTICE 'Orphaned songs to fix: %', orphan_count;
  
  IF orphan_count = 0 THEN
    RAISE EXCEPTION 'No orphaned songs found. Nothing to do.';
  END IF;
END $$;

-- ============================================
-- STEP 2: ADD TO EXISTING GROUPS (EXACT MATCH)
-- ============================================

-- Insert orphaned songs into groups where base_title_unaccent matches exactly
INSERT INTO kara_song_group_members (group_id, song_id, created_at)
SELECT DISTINCT ON (s.id)
  g.id as group_id,
  s.id as song_id,
  NOW() as created_at
FROM kara_songs s
LEFT JOIN kara_song_group_members m ON s.id = m.song_id
JOIN kara_song_groups g ON LOWER(TRIM(s.base_title_unaccent)) = LOWER(TRIM(g.base_title_unaccent))
WHERE m.song_id IS NULL
  AND s.base_title_unaccent IS NOT NULL
  AND g.base_title_unaccent IS NOT NULL
ON CONFLICT (group_id, song_id) DO NOTHING;

-- Report how many were matched
DO $$
DECLARE
  matched_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO matched_count
  FROM kara_songs s
  JOIN kara_song_group_members m ON s.id = m.song_id
  WHERE s.base_title_unaccent IN (
    SELECT DISTINCT s2.base_title_unaccent
    FROM kara_songs s2
    LEFT JOIN kara_song_group_members m2 ON s2.id = m2.song_id
    WHERE m2.song_id IS NULL
  );
  
  RAISE NOTICE 'Songs matched to existing groups: %', matched_count;
END $$;

-- ============================================
-- STEP 3: CREATE NEW GROUPS FOR UNMATCHED SONGS
-- ============================================

-- Insert new groups for songs that still don't have a group
INSERT INTO kara_song_groups (id, base_title_unaccent, base_title_display, created_at)
SELECT 
  gen_random_uuid() as id,
  LOWER(TRIM(s.base_title_unaccent)) as base_title_unaccent,
  s.title as base_title_display,
  NOW() as created_at
FROM kara_songs s
LEFT JOIN kara_song_group_members m ON s.id = m.song_id
WHERE m.song_id IS NULL
  AND s.base_title_unaccent IS NOT NULL
  AND s.base_title_unaccent != ''
ON CONFLICT (base_title_unaccent) DO NOTHING;

-- Report new groups created
DO $$
DECLARE
  new_groups_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO new_groups_count
  FROM kara_song_groups
  WHERE created_at > NOW() - INTERVAL '5 seconds';
  
  RAISE NOTICE 'New groups created: %', new_groups_count;
END $$;

-- ============================================
-- STEP 4: ADD REMAINING ORPHANS TO NEW GROUPS
-- ============================================

-- Add songs to the groups we just created
INSERT INTO kara_song_group_members (group_id, song_id, created_at)
SELECT DISTINCT ON (s.id)
  g.id as group_id,
  s.id as song_id,
  NOW() as created_at
FROM kara_songs s
LEFT JOIN kara_song_group_members m ON s.id = m.song_id
JOIN kara_song_groups g ON LOWER(TRIM(s.base_title_unaccent)) = LOWER(TRIM(g.base_title_unaccent))
WHERE m.song_id IS NULL
  AND s.base_title_unaccent IS NOT NULL
  AND s.base_title_unaccent != ''
ON CONFLICT (group_id, song_id) DO NOTHING;

-- ============================================
-- STEP 5: HANDLE SONGS WITH NULL base_title
-- ============================================

-- Songs with NULL base_title need special handling
-- Create groups using their regular title instead
INSERT INTO kara_song_groups (id, base_title_unaccent, base_title_display, created_at)
SELECT 
  gen_random_uuid() as id,
  LOWER(TRIM(REGEXP_REPLACE(s.title, '[^a-z0-9\s]', '', 'gi'))) as base_title_unaccent,
  s.title as base_title_display,
  NOW() as created_at
FROM kara_songs s
LEFT JOIN kara_song_group_members m ON s.id = m.song_id
WHERE m.song_id IS NULL
  AND (s.base_title_unaccent IS NULL OR s.base_title_unaccent = '')
ON CONFLICT (base_title_unaccent) DO NOTHING;

-- Add these songs to their new groups
INSERT INTO kara_song_group_members (group_id, song_id, created_at)
SELECT DISTINCT ON (s.id)
  g.id as group_id,
  s.id as song_id,
  NOW() as created_at
FROM kara_songs s
LEFT JOIN kara_song_group_members m ON s.id = m.song_id
JOIN kara_song_groups g ON LOWER(TRIM(REGEXP_REPLACE(s.title, '[^a-z0-9\s]', '', 'gi'))) = g.base_title_unaccent
WHERE m.song_id IS NULL
  AND (s.base_title_unaccent IS NULL OR s.base_title_unaccent = '')
ON CONFLICT (group_id, song_id) DO NOTHING;

-- ============================================
-- STEP 6: VALIDATION
-- ============================================

-- Check how many orphans remain
DO $$
DECLARE
  remaining_orphans INTEGER;
BEGIN
  SELECT COUNT(*) INTO remaining_orphans
  FROM kara_songs s
  LEFT JOIN kara_song_group_members m ON s.id = m.song_id
  WHERE m.song_id IS NULL;
  
  RAISE NOTICE 'Orphaned songs remaining: %', remaining_orphans;
  
  IF remaining_orphans > 0 THEN
    RAISE WARNING 'WARNING: % songs still orphaned. Review manually.', remaining_orphans;
  ELSE
    RAISE NOTICE 'SUCCESS: All songs now have groups!';
  END IF;
END $$;

-- Show summary
SELECT 
  'SUMMARY' as section,
  'Before' as status,
  (SELECT COUNT(*) FROM kara_songs) as total_songs,
  67 as orphaned_songs,
  (SELECT COUNT(*) FROM kara_song_groups WHERE created_at < NOW() - INTERVAL '10 seconds') as groups_before
UNION ALL
SELECT 
  'SUMMARY',
  'After',
  (SELECT COUNT(*) FROM kara_songs),
  (SELECT COUNT(*) FROM kara_songs s 
   LEFT JOIN kara_song_group_members m ON s.id = m.song_id 
   WHERE m.song_id IS NULL),
  (SELECT COUNT(*) FROM kara_song_groups);

-- ============================================
-- COMMIT OR ROLLBACK
-- ============================================

DO $$
BEGIN
  RAISE NOTICE '============================================';
  RAISE NOTICE 'REVIEW THE OUTPUT ABOVE';
  RAISE NOTICE 'If all songs are fixed: COMMIT;';
  RAISE NOTICE 'If something is wrong: ROLLBACK;';
  RAISE NOTICE '============================================';
END $$;

-- Uncomment ONE of these:
-- COMMIT;  -- Uncomment to apply changes
-- ROLLBACK;  -- Uncomment to undo everything
