import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/server/lib/supabase';
import { config } from '@/server/config';

// Mark route as dynamic
export const dynamic = 'force-dynamic';

/**
 * Build play URL from storage_path
 * Strip /Videos/ prefix since media server base URL already points to videos directory
 */
function buildPlayUrl(storagePath: string): string {
  // Remove /Videos/ or Videos/ prefix if present
  let cleanPath = storagePath.replace(/^\/Videos\//i, '').replace(/^Videos\//i, '');
  
  // Encode only the filename (not the whole path)
  const encoded = encodeURIComponent(cleanPath);
  return `${config.mediaServer.baseUrl}/${encoded}`;
}

/**
 * Get versions for a song by group_id or title_clean (updated for new schema)
 * Returns versions with complete metadata from kara_versions table
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const groupId = searchParams.get('group_id');
    const titleClean = searchParams.get('title_clean'); // Backward compatibility

    // Prefer group_id, fallback to title_clean
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
      // Query by group_id (preferred method)
      const result = await supabaseAdmin
        .from('kara_versions')
        .select(`
          id,
          group_id,
          title_display,
          tone,
          mixer,
          style,
          artist_name,
          performance_type,
          key,
          tempo,
          label,
          is_default,
          kara_files!inner (
            id,
            storage_path,
            duration_seconds,
            type
          )
        `)
        .eq('group_id', groupId)
        .eq('kara_files.type', 'video')
        .order('is_default', { ascending: false })
        .order('tone', { ascending: true, nullsFirst: false })
        .order('mixer', { ascending: true, nullsFirst: false })
        .order('style', { ascending: true, nullsFirst: false });
      
      versions = result.data || [];
      error = result.error;
    } else if (titleClean) {
      // Fallback: Query by title_clean (backward compatibility)
      const result = await supabaseAdmin
        .from('kara_versions')
        .select(`
          id,
          group_id,
          title_display,
          title_clean,
          tone,
          mixer,
          style,
          artist_name,
          performance_type,
          key,
          tempo,
          label,
          is_default,
          kara_files!inner (
            id,
            storage_path,
            duration_seconds,
            type
          )
        `)
        .ilike('title_clean', titleClean)
        .eq('kara_files.type', 'video')
        .order('is_default', { ascending: false })
        .order('tone', { ascending: true, nullsFirst: false });
      
      versions = result.data || [];
      error = result.error;
    }

    if (error) {
      console.error('[versions] Database error:', error);
      throw new Error(`Failed to fetch versions: ${error.message}`);
    }

    if (!versions || versions.length === 0) {
      console.log('[versions] No versions found:', { group_id: groupId, title_clean: titleClean });
      
      return NextResponse.json({
        group_id: groupId || null,
        title_clean: titleClean || null,
        versions: [],
      });
    }
    
    console.log('[versions] Found', versions.length, 'versions:', { group_id: groupId, title_clean: titleClean });

    // Format versions
    const formattedVersions = versions.map((v: any) => {
      const file = Array.isArray(v.kara_files) ? v.kara_files[0] : v.kara_files;
      
      return {
        version_id: v.id,
        file_id: file.id,
        tone: v.tone || null,
        mixer: v.mixer || null,
        style: v.style || null,
        artist: v.artist_name || null,
        performance_type: v.performance_type || 'solo',
        pitch: v.key || null,
        tempo: v.tempo || null,
        is_default: v.is_default || false,
        file: {
          file_id: file.id,
          storage_path: file.storage_path || null,
          play_url: file.storage_path ? buildPlayUrl(file.storage_path) : null,
          duration_s: file.duration_seconds || null,
        },
      };
    });

    console.log(`[versions] Returning ${formattedVersions.length} formatted versions`);

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
