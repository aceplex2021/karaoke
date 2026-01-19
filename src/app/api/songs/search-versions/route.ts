import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/server/lib/supabase';
import { config } from '@/server/config';
import type { VersionSearchResult, VersionSearchResponse } from '@/shared/types';

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
 * YouTube-like search: Flat list of versions (updated for new schema)
 * One card per version, no grouping
 * 
 * This is identical to /api/songs/search but kept for backward compatibility
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const q = searchParams.get('q');
    const limit = parseInt(searchParams.get('limit') || '100', 10);
    
    console.log('[search-versions] Query:', { q, limit });

    // Require search query
    if (!q || !q.trim()) {
      return NextResponse.json<VersionSearchResponse>({
        query: '',
        results: [],
        total: 0,
      });
    }

    const searchTerm = q.trim();
    
    // Normalize search term (remove accents for matching English keyboard)
    const normalizedSearch = searchTerm
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd');

    // Query kara_versions directly (simplified schema)
    // Search BOTH normalized_title (English keyboard) AND title_display (Vietnamese keyboard)
    const { data: versions, error } = await supabaseAdmin
      .from('kara_versions')
      .select(`
        id,
        title_display,
        normalized_title,
        tone,
        mixer,
        style,
        artist_name,
        performance_type,
        key,
        tempo,
        is_default,
        kara_files!inner (
          id,
          storage_path,
          duration_seconds,
          type
        )
      `)
      .or(`normalized_title.ilike.%${normalizedSearch}%,title_display.ilike.%${searchTerm}%`)
      .eq('kara_files.type', 'video')
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

    // Format results (flat list)
    const results: VersionSearchResult[] = versions
      .filter(v => v.kara_files && v.kara_files.length > 0)
      .map((v: any) => {
        const file = Array.isArray(v.kara_files) ? v.kara_files[0] : v.kara_files;
        return {
          version_id: v.id,
          song_id: v.id, // version IS the song in new schema
          song_title: v.title_display,
          artist_name: v.artist_name || null,
          tone: v.tone || null,
          mixer: v.mixer || null,
          style: v.style || null,
          pitch: v.key || null,
          tempo: v.tempo || null,
          storage_path: file.storage_path,
          duration_seconds: file.duration_seconds || null,
          play_url: buildPlayUrl(file.storage_path),
        };
      });

    // Sort: exact matches first, then alphabetical
    const searchTermLower = searchTerm.toLowerCase();
    results.sort((a, b) => {
      const titleA = (a.song_title || '').toLowerCase();
      const titleB = (b.song_title || '').toLowerCase();
      
      const aExact = titleA.startsWith(searchTermLower);
      const bExact = titleB.startsWith(searchTermLower);
      
      if (aExact && !bExact) return -1;
      if (!aExact && bExact) return 1;
      
      return titleA.localeCompare(titleB);
    });

    console.log(`[search-versions] Found ${results.length} versions`);

    return NextResponse.json<VersionSearchResponse>({
      query: searchTerm,
      results,
      total: results.length,
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
