import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/server/lib/supabase';

/**
 * GET /api/songs/[songId]/group
 * Get the song group for a specific song_id (used for History/Favorites)
 */
/**
 * GET /api/songs/[songId]/group
 * Get song group for a song_id from History/Favorites
 * Returns full SongGroupResult format (same as search API)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { songId: string } }
) {
  try {
    const { songId } = params;
    console.log('[songs/songId/group] Looking up group for song_id:', songId);

    // Find group_id through kara_song_group_members
    const { data: membership, error: memberError } = await supabaseAdmin
      .from('kara_song_group_members')
      .select('group_id')
      .eq('song_id', songId)
      .single();

    if (memberError || !membership) {
      console.error('[songs/songId/group] Song not in any group:', memberError);
      return NextResponse.json(
        { error: 'Song not found in any group' },
        { status: 404 }
      );
    }

    const groupId = membership.group_id;
    console.log('[songs/songId/group] Found group_id:', groupId);

    // Get group info from kara_song_groups
    const { data: group, error: groupError } = await supabaseAdmin
      .from('kara_song_groups')
      .select('base_title_display, base_title_unaccent')
      .eq('id', groupId)
      .single();

    if (groupError || !group) {
      console.error('[songs/songId/group] Group not found:', groupError);
      return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    }

    // Get all members (songs) in this group
    const { data: members } = await supabaseAdmin
      .from('kara_song_group_members')
      .select('song_id')
      .eq('group_id', groupId);

    if (!members || members.length === 0) {
      return NextResponse.json({ error: 'No songs in group' }, { status: 404 });
    }

    const songIds = members.map(m => m.song_id);

    // Get artists
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

    // Get versions with files
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
      return NextResponse.json({ error: 'No versions found' }, { status: 404 });
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
          },
        };
      });

    // Select best version (prefer nam, non-remix, is_default)
    const namVersions = groupVersions.filter(v => v.label && (v.label === 'nam' || v.label.startsWith('nam_')));
    const bestVersion = namVersions.length > 0 
      ? namVersions.sort((a, b) => a.id.localeCompare(b.id))[0]
      : groupVersions.find(v => v.is_default) || groupVersions[0];

    // Get tones and styles
    const allLabels = groupVersions.map(v => v.label).filter(Boolean);
    const tones = [...new Set(allLabels.filter(l => l === 'nam' || l === 'nu' || l.startsWith('nam_') || l.startsWith('nu_')))];
    const styles = [...new Set(allLabels.filter(l => !tones.includes(l)))];

    // Build SongGroupResult (same format as search API)
    const result = {
      group_id: groupId,
      display_title: group.base_title_display || group.base_title_unaccent,
      normalized_title: group.base_title_unaccent,
      artists: artistNames,
      best_version: {
        version_id: bestVersion.id,
        label: bestVersion.label || null,
        tone: bestVersion.label === 'nam' || bestVersion.label?.startsWith('nam_') ? 'nam' :
              bestVersion.label === 'nu' || bestVersion.label?.startsWith('nu_') ? 'nu' : null,
        pitch: bestVersion.key || null,
        tempo: bestVersion.tempo || null,
        is_default: bestVersion.is_default || false,
        styles: bestVersion.label ? [bestVersion.label] : [],
        file: bestVersion.file,
      },
      available: {
        version_count: groupVersions.length,
        tones,
        styles,
      },
    };

    console.log('[songs/songId/group] Success! Returning group:', result.display_title);
    return NextResponse.json({ group: result });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    console.error('[songs/songId/group] Unexpected error:', error);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
