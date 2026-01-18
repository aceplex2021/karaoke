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
 * Select best version from available versions
 * Rules: Prefer "nam", non-remix, standard karaoke, then lowest version_id
 */
function selectBestVersion(versions: any[]): any | null {
  if (!versions || versions.length === 0) return null;

  // All versions passed here should already have video files (filtered in query)
  // Priority 1: Prefer "nam" tone
  const namVersions = versions.filter(v => 
    v.label && (v.label === 'nam' || v.label.startsWith('nam_'))
  );
  if (namVersions.length > 0) {
    // Among nam versions, prefer non-remix
    const namNonRemix = namVersions.filter(v => 
      !v.label?.includes('remix')
    );
    if (namNonRemix.length > 0) {
      return namNonRemix.sort((a, b) => a.id.localeCompare(b.id))[0];
    }
    return namVersions.sort((a, b) => a.id.localeCompare(b.id))[0];
  }

  // Priority 2: Prefer non-remix
  const nonRemix = versions.filter(v => 
    !v.label?.includes('remix')
  );
  if (nonRemix.length > 0) {
    return nonRemix.sort((a, b) => a.id.localeCompare(b.id))[0];
  }

  // Priority 3: Prefer is_default
  const defaultVersion = versions.find(v => v.is_default);
  if (defaultVersion) return defaultVersion;

  // Fallback: lowest version_id
  return versions.sort((a, b) => a.id.localeCompare(b.id))[0];
}

/**
 * Group-aware song search (per Songs_API_Contract.md)
 * Returns one result per song group with best_version selected server-side
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const q = searchParams.get('q');
    const limit = parseInt(searchParams.get('limit') || '30', 10);
    
    console.log('Group-aware search request:', { q, limit });

    // REQUIRE search query
    if (!q || !q.trim()) {
      return NextResponse.json({ query: '', results: [] });
    }

    const searchTerm = q.trim().toLowerCase();

    // Use a single RPC call or simplified query approach
    // First, get groups matching search
    const { data: groups, error: groupsError } = await supabaseAdmin
      .from('kara_song_groups')
      .select('id, base_title_unaccent, base_title_display')
      .ilike('base_title_unaccent', `%${searchTerm}%`)
      .limit(limit);

    if (groupsError) {
      throw new Error(`Failed to search groups: ${groupsError.message}`);
    }

    if (!groups || groups.length === 0) {
      return NextResponse.json({ query: searchTerm, results: [] });
    }

    const groupIds = groups.map(g => g.id);

    // Get all data in one go using a more direct approach
    // For each group, get its versions with files directly
    const results = await Promise.all(
      groups.map(async (group) => {
        // Get songs in this group
        const { data: members } = await supabaseAdmin
          .from('kara_song_group_members')
          .select('song_id')
          .eq('group_id', group.id);

        if (!members || members.length === 0) {
          return null;
        }

        const songIds = members.map(m => m.song_id).filter(Boolean);
        
        // Get artists for these songs
        const { data: songs } = await supabaseAdmin
          .from('kara_songs')
          .select('artist_id')
          .in('id', songIds);

        const artistIds = [...new Set((songs || []).map(s => s.artist_id).filter(Boolean))];
        const { data: artists } = await supabaseAdmin
          .from('kara_artists')
          .select('name')
          .in('id', artistIds);

        const artistNames = (artists || []).map(a => a.name).filter(Boolean);

        // Get versions with files for songs in this group
        const { data: versions } = await supabaseAdmin
          .from('kara_versions')
          .select(`
            id,
            song_id,
            label,
            key,
            tempo,
            is_default,
            kara_files!inner (
              id,
              storage_path,
              type,
              duration_seconds
            )
          `)
          .in('song_id', songIds)
          .eq('kara_files.type', 'video');

        if (!versions || versions.length === 0) {
          return null;
        }

        // Format versions
        const groupVersions = versions
          .filter(v => v.kara_files && v.kara_files.length > 0)
          .map((v: any) => {
            const file = Array.isArray(v.kara_files) ? v.kara_files[0] : v.kara_files;
            return {
              id: v.id,
              song_id: v.song_id,
              label: v.label,
              key: v.key,
              tempo: v.tempo,
              is_default: v.is_default,
              file: {
                id: file.id,
                storage_path: file.storage_path,
                play_url: buildPlayUrl(file.storage_path),
              },
            };
          });

        if (groupVersions.length === 0) {
          return null;
        }

        // Select best version
        const bestVersion = selectBestVersion(groupVersions);

        // Get available tones/styles
        const allLabels = groupVersions.map(v => v.label).filter(Boolean);
        const tones = [...new Set(allLabels.filter(l => l === 'nam' || l === 'nu' || l.startsWith('nam_') || l.startsWith('nu_')))];
        const styles = [...new Set(allLabels.filter(l => !tones.includes(l)))];

        return {
          group_id: group.id,
          display_title: group.base_title_display || group.base_title_unaccent,
          normalized_title: group.base_title_unaccent,
          artists: artistNames,
          best_version: bestVersion ? {
            version_id: bestVersion.id,
            label: bestVersion.label || null,
            tone: bestVersion.label === 'nam' || bestVersion.label?.startsWith('nam_') ? 'nam' :
                  bestVersion.label === 'nu' || bestVersion.label?.startsWith('nu_') ? 'nu' : null,
            pitch: bestVersion.key || null,
            tempo: bestVersion.tempo || null,
            is_default: bestVersion.is_default || false,
            styles: bestVersion.label ? [bestVersion.label] : [],
            file: bestVersion.file,
          } : null,
          available: {
            version_count: groupVersions.length,
            tones,
            styles,
          },
        };
      })
    );

    const validResults = results.filter(r => r !== null && r.best_version !== null);
    console.log(`Found ${validResults.length} results from ${groups.length} groups`);
    
    // Sort results: exact matches first, then alphabetical
    const searchTermLower = searchTerm.toLowerCase();
    validResults.sort((a, b) => {
      const titleA = (a?.display_title || '').toLowerCase();
      const titleB = (b?.display_title || '').toLowerCase();
      const normalizedA = (a?.normalized_title || '').toLowerCase();
      const normalizedB = (b?.normalized_title || '').toLowerCase();
      
      // Check for exact matches (starts with search term)
      const aExact = titleA.startsWith(searchTermLower) || normalizedA.startsWith(searchTermLower);
      const bExact = titleB.startsWith(searchTermLower) || normalizedB.startsWith(searchTermLower);
      
      if (aExact && !bExact) return -1; // a comes first
      if (!aExact && bExact) return 1;  // b comes first
      
      // Both exact or both not exact - sort alphabetically
      return titleA.localeCompare(titleB);
    });
    
    return NextResponse.json({ query: searchTerm, results: validResults });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    console.error('Error in group-aware search:', error);
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

