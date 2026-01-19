import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/server/lib/supabase';

/**
 * GET /api/songs/[songId]/group
 * Get song group for a version_id (updated for new schema)
 * In new schema: songId is actually a version_id
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { songId: string } }
) {
  try {
    const { songId } = params;
    console.log('[songs/songId/group] Looking up group for version_id:', songId);

    // Get version directly (in new schema, version_id IS the song)
    const { data: version, error: versionError } = await supabaseAdmin
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
        is_default
      `)
      .eq('id', songId)
      .single();

    if (versionError || !version) {
      console.error('[songs/songId/group] Version not found:', versionError);
      return NextResponse.json(
        { error: 'Version not found' },
        { status: 404 }
      );
    }

    // If no group_id, return minimal result
    if (!version.group_id) {
      return NextResponse.json({
        version: {
          version_id: version.id,
          title: version.title_display,
          tone: version.tone,
          mixer: version.mixer,
          style: version.style,
          artist_name: version.artist_name,
        }
      });
    }

    const groupId = version.group_id;
    console.log('[songs/songId/group] Found group_id:', groupId);

    // Get group info
    const { data: group, error: groupError } = await supabaseAdmin
      .from('kara_song_groups')
      .select('base_title_display, base_title_unaccent')
      .eq('id', groupId)
      .single();

    if (groupError || !group) {
      console.error('[songs/songId/group] Group not found:', groupError);
      return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    }

    // Get all versions in this group
    const { data: allVersions } = await supabaseAdmin
      .from('kara_versions')
      .select(`
        id,
        title_display,
        tone,
        mixer,
        style,
        artist_name,
        label,
        key,
        tempo,
        is_default,
        kara_files!inner (
          id,
          storage_path,
          type
        )
      `)
      .eq('group_id', groupId)
      .eq('kara_files.type', 'video');

    const versions = (allVersions || []).filter(v => v.kara_files && v.kara_files.length > 0);

    // Get unique artists from versions
    const artistNames = [...new Set(versions.map(v => v.artist_name).filter(Boolean))];

    // Get tones and styles
    const tones = [...new Set(versions.map(v => v.tone).filter(Boolean))];
    const styles = [...new Set(versions.map(v => v.style).filter(Boolean))];

    // Find best version (prefer nam, is_default)
    const namVersions = versions.filter(v => v.tone?.toLowerCase() === 'nam');
    const bestVersion = namVersions.find(v => v.is_default) 
      || namVersions[0]
      || versions.find(v => v.is_default)
      || versions[0];

    const bestFile = Array.isArray(bestVersion.kara_files) ? bestVersion.kara_files[0] : bestVersion.kara_files;

    // Build result
    const result = {
      group_id: groupId,
      display_title: group.base_title_display || group.base_title_unaccent,
      normalized_title: group.base_title_unaccent,
      artists: artistNames,
      best_version: {
        version_id: bestVersion.id,
        label: bestVersion.label || null,
        tone: bestVersion.tone || null,
        pitch: bestVersion.key || null,
        tempo: bestVersion.tempo || null,
        is_default: bestVersion.is_default || false,
        styles: bestVersion.label ? [bestVersion.label] : [],
        file: {
          id: bestFile.id,
          storage_path: bestFile.storage_path,
        },
      },
      available: {
        version_count: versions.length,
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
