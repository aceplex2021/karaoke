-- Comprehensive investigation of view mismatch
-- Run this to understand why search results don't match version queries

-- ============================================================================
-- STEP 1: Get the actual view definitions
-- ============================================================================
-- This shows us exactly what SQL logic each view uses
SELECT 
    'VIEW_DEFINITIONS' as section,
    viewname,
    definition
FROM pg_views
WHERE schemaname = 'public'
  AND viewname IN ('kara_song_versions_view', 'kara_song_versions_detail_view')
ORDER BY viewname;

-- ============================================================================
-- STEP 2: Compare outputs for "dem dong" (the problematic case)
-- ============================================================================
-- What does the search view return?
SELECT 
    'SEARCH_VIEW_OUTPUT' as section,
    song_title,
    version_count,
    LENGTH(song_title) as title_length
FROM kara_song_versions_view
WHERE song_title ILIKE '%dem dong%'
ORDER BY song_title;

-- What does the detail view have?
SELECT 
    'DETAIL_VIEW_OUTPUT' as section,
    song_title,
    COUNT(*) as file_count,
    COUNT(DISTINCT version_id) as version_count,
    LENGTH(song_title) as title_length
FROM kara_song_versions_detail_view
WHERE song_title ILIKE '%dem dong%'
GROUP BY song_title
ORDER BY song_title;

-- ============================================================================
-- STEP 3: Check if group_id is available in the views
-- ============================================================================
-- Does search view have group_id? (Check columns)
SELECT 
    'SEARCH_VIEW_COLUMNS' as section,
    column_name,
    data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'kara_song_versions_view'
ORDER BY ordinal_position;

-- Does detail view have group_id? (Check columns)
SELECT 
    'DETAIL_VIEW_COLUMNS' as section,
    column_name,
    data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'kara_song_versions_detail_view'
ORDER BY ordinal_position;

-- ============================================================================
-- STEP 4: Trace back to source tables
-- ============================================================================
-- What does the source data look like in kara_song_groups?
SELECT 
    'SOURCE_GROUPS' as section,
    id as group_id,
    base_title_display,
    base_title_unaccent,
    LOWER(COALESCE(base_title_display, base_title_unaccent)) as cleaned_title
FROM kara_song_groups
WHERE LOWER(COALESCE(base_title_display, base_title_unaccent)) ILIKE '%dem dong%'
ORDER BY base_title_display;

-- ============================================================================
-- STEP 5: Understand the grouping logic
-- ============================================================================
-- How many groups have "dem dong" in their title?
SELECT 
    'GROUP_ANALYSIS' as section,
    COUNT(*) as total_groups,
    COUNT(DISTINCT LOWER(COALESCE(base_title_display, base_title_unaccent))) as unique_cleaned_titles
FROM kara_song_groups
WHERE LOWER(COALESCE(base_title_display, base_title_unaccent)) ILIKE '%dem dong%';

-- Show all groups with their version counts
SELECT 
    'GROUPS_WITH_VERSIONS' as section,
    g.id as group_id,
    LOWER(COALESCE(g.base_title_display, g.base_title_unaccent)) as cleaned_title,
    COUNT(DISTINCT v.id) as version_count,
    COUNT(DISTINCT f.id) as file_count
FROM kara_song_groups g
INNER JOIN kara_song_group_members m ON g.id = m.group_id
INNER JOIN kara_songs s ON m.song_id = s.id
INNER JOIN kara_versions v ON s.id = v.song_id
INNER JOIN kara_files f ON v.id = f.version_id
WHERE f.type = 'video'
  AND LOWER(COALESCE(g.base_title_display, g.base_title_unaccent)) ILIKE '%dem dong%'
GROUP BY g.id, g.base_title_display, g.base_title_unaccent
ORDER BY cleaned_title;
