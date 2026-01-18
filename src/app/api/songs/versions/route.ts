import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/server/lib/supabase';
import { config } from '@/server/config';

// Mark route as dynamic
export const dynamic = 'force-dynamic';

/**
 * Build play URL from storage_path
 */
function buildPlayUrl(storagePath: string): string {
  const encoded = encodeURIComponent(storagePath);
  return `${config.mediaServer.baseUrl}/${encoded}`;
}

/**
 * Get versions for a song by title_clean
 * Uses kara_song_versions_detail_view (authoritative source)
 * Returns versions with tone, mixer, style for display
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const groupId = searchParams.get('group_id');
    const titleClean = searchParams.get('title_clean'); // Keep for backward compatibility

    // Prefer group_id, fallback to title_clean for backward compatibility
    if (!groupId && (!titleClean || !titleClean.trim())) {
      return NextResponse.json(
        { error: 'group_id or title_clean parameter is required' },
        { status: 400 }
      );
    }

    console.log('[versions] Fetching versions:', { group_id: groupId, title_clean: titleClean });

    let versions: any[] = [];
    let error: any = null;

    if (groupId) {
      // Query by group_id (preferred method - unambiguous)
      const result = await supabaseAdmin
        .from('kara_song_versions_detail_view')
        .select('id, version_id, group_id, song_title, tone, mixer, style, artist, storage_path')
        .eq('group_id', groupId)
        .order('tone', { ascending: true, nullsFirst: false })
        .order('mixer', { ascending: true, nullsFirst: false })
        .order('style', { ascending: true, nullsFirst: false });
      
      versions = result.data || [];
      error = result.error;
    } else if (titleClean) {
      // Fallback: Query by title_clean (backward compatibility)
      const result = await supabaseAdmin
        .from('kara_song_versions_detail_view')
        .select('id, version_id, group_id, song_title, tone, mixer, style, artist, storage_path')
        .not('song_title', 'is', null)  // Exclude medleys (NULL song_title)
        .ilike('song_title', `${titleClean}%`)  // Match titles that start with search title
        .order('tone', { ascending: true, nullsFirst: false })
        .order('mixer', { ascending: true, nullsFirst: false })
        .order('style', { ascending: true, nullsFirst: false });
      
      versions = result.data || [];
      error = result.error;

      // Filter to exact match (case-insensitive)
      const titleCleanLower = titleClean.toLowerCase().trim();
      versions = versions.filter((v: any) => {
        if (!v.song_title) return false;
        const songTitleLower = v.song_title.toLowerCase().trim();
        return songTitleLower === titleCleanLower;
      });
    }

    if (error) {
      console.error('[versions] Database error:', error);
      throw new Error(`Failed to fetch versions: ${error.message}`);
    }

    const matchingVersions = versions;

    console.log('[versions] Query result:', {
      total_versions: matchingVersions.length,
      group_id: groupId,
      title_clean: titleClean,
      sample_match: matchingVersions[0] || null,
    });

    if (matchingVersions.length === 0) {
      console.log('[versions] No versions found:', { group_id: groupId, title_clean: titleClean });
      
      return NextResponse.json({
        group_id: groupId || null,
        title_clean: titleClean || null,
        versions: [],
      });
    }
    
    console.log('[versions] Found', matchingVersions.length, 'versions:', { group_id: groupId, title_clean: titleClean });

    // Group by version_id - one version can have multiple files
    // We want to show one row per version, not one row per file
    const versionsByVersionId = new Map<string, any>();
    
    matchingVersions.forEach((v: any) => {
      const versionId = v.version_id;
      if (!versionsByVersionId.has(versionId)) {
        // First file for this version - use it
        versionsByVersionId.set(versionId, v);
      }
      // If multiple files exist for same version, we keep the first one
      // (could enhance later to pick "best" file based on quality/duration)
    });

    // Format versions - one per version_id
    const formattedVersions = Array.from(versionsByVersionId.values()).map((v: any) => {
      return {
        version_id: v.version_id, // kara_versions.id (required for kara_queue)
        file_id: v.id, // kara_files.id (for unique identification)
        tone: v.tone || null,
        mixer: v.mixer || null,
        style: v.style || null,
        artist: v.artist || null,
        file: {
          file_id: v.id,
          storage_path: v.storage_path || null,
          play_url: v.storage_path ? buildPlayUrl(v.storage_path) : null,
          duration_s: null,
        },
      };
    });

    console.log(`[versions] Found ${formattedVersions.length} unique versions (from ${matchingVersions.length} files):`, { group_id: groupId, title_clean: titleClean });

    return NextResponse.json({
      group_id: groupId || null,
      title_clean: titleClean || null,
      versions: formattedVersions,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    console.error('[versions] Error fetching versions:', error);
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
