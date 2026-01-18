import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/server/lib/supabase';
import { config } from '@/server/config';
import type { VersionSearchResult, VersionSearchResponse } from '@/shared/types';

export const dynamic = 'force-dynamic';

/**
 * Build play URL from storage_path (basename only)
 */
function buildPlayUrl(storagePath: string): string {
  if (!storagePath) return '';
  
  // Extract basename (remove folder prefixes)
  let decoded = decodeURIComponent(storagePath);
  decoded = decoded.trim().replace(/^[/\\]+|[/\\]+$/g, '');
  const parts = decoded.split(/[/\\]+/);
  const basename = parts[parts.length - 1];
  
  return `${config.mediaServer.baseUrl}/${encodeURIComponent(basename)}`;
}

/**
 * Parse label to extract tone and style
 * Examples: "nam", "nu_beat", "nam_acoustic", "beat"
 */
function parseLabel(label: string | null): {
  tone: string | null;
  style: string | null;
} {
  if (!label) return { tone: null, style: null };
  
  const lower = label.toLowerCase().trim();
  
  // Extract tone
  let tone: string | null = null;
  if (lower === 'nam' || lower.startsWith('nam_')) {
    tone = 'nam';
  } else if (lower === 'nu' || lower.startsWith('nu_')) {
    tone = 'nu';
  }
  
  // Extract style (everything after tone, or the whole label if no tone)
  let style: string | null = null;
  if (tone && lower.includes('_')) {
    style = lower.split('_').slice(1).join('_');
  } else if (!tone && lower !== 'nam' && lower !== 'nu') {
    style = lower;
  }
  
  return { tone, style };
}

/**
 * YouTube-like search: Flat list of versions
 * One card per version, no grouping
 * 
 * This queries kara_song_versions_detail_view but enhances it with data
 * from kara_versions and kara_files for complete metadata
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const q = searchParams.get('q');
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    
    console.log('[search-versions] Query:', { q, limit });

    // Require search query
    if (!q || !q.trim()) {
      return NextResponse.json<VersionSearchResponse>({
        query: '',
        results: [],
        total: 0,
      });
    }

    const searchTerm = q.trim().toLowerCase();

    // Query using kara_song_versions_detail_view as base,
    // but join with kara_versions and kara_files for complete data
    const { data: versions, error, count } = await supabaseAdmin
      .from('kara_files')
      .select(`
        id,
        version_id,
        storage_path,
        duration_seconds,
        kara_versions!inner (
          id,
          song_id,
          label,
          key,
          tempo,
          kara_songs!inner (
            id,
            title_display,
            artist_name,
            kara_song_group_members!inner (
              group_id,
              kara_song_groups!inner (
                base_title_display
              )
            )
          )
        )
      `, { count: 'exact' })
      .eq('type', 'video')
      .ilike('kara_versions.kara_songs.title_display', `%${searchTerm}%`)
      .order('storage_path', { ascending: true })
      .limit(limit);

    if (error) {
      throw new Error(`Search failed: ${error.message}`);
    }

    if (!versions || versions.length === 0) {
      return NextResponse.json<VersionSearchResponse>({
        query: searchTerm,
        results: [],
        total: 0,
      });
    }

    // Map to VersionSearchResult
    const results: VersionSearchResult[] = versions.map((file: any) => {
      const version = file.kara_versions;
      const song = version.kara_songs;
      const groupMember = Array.isArray(song.kara_song_group_members) 
        ? song.kara_song_group_members[0] 
        : song.kara_song_group_members;
      const group = groupMember?.kara_song_groups;
      
      const { tone, style } = parseLabel(version.label);
      
      return {
        version_id: file.version_id,
        song_id: version.song_id,
        song_title: group?.base_title_display || song.title_display || 'Untitled',
        artist_name: song.artist_name || null,
        tone,
        mixer: null, // Extracted from storage_path in view, not available here
        style,
        pitch: version.key || null,
        tempo: version.tempo || null,
        storage_path: file.storage_path,
        duration_seconds: file.duration_seconds || null,
        play_url: buildPlayUrl(file.storage_path),
      };
    });

    console.log(`[search-versions] Found ${results.length} versions`);

    return NextResponse.json<VersionSearchResponse>({
      query: searchTerm,
      results,
      total: count || results.length,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    console.error('[search-versions] Error:', error);
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
