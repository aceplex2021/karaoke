import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/server/lib/supabase';
import { config } from '@/server/config';

/**
 * Build play URL from storage_path
 */
function buildPlayUrl(storagePath: string): string {
  const encoded = encodeURIComponent(storagePath);
  return `${config.mediaServer.baseUrl}/${encoded}`;
}

/**
 * Get all versions for a song group (per Songs_API_Contract.md)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { groupId: string } }
) {
  try {
    const { groupId } = params;

    // Get group info
    const { data: group, error: groupError } = await supabaseAdmin
      .from('kara_song_groups')
      .select('id, base_title_display, base_title_unaccent')
      .eq('id', groupId)
      .single();

    if (groupError || !group) {
      return NextResponse.json(
        { error: 'Group not found' },
        { status: 404 }
      );
    }

    // Get songs in this group
    const { data: members, error: membersError } = await supabaseAdmin
      .from('kara_song_group_members')
      .select('song_id')
      .eq('group_id', groupId);

    if (membersError) {
      throw new Error(`Failed to fetch group members: ${membersError.message}`);
    }

    const songIds = (members || []).map((m: any) => m.song_id);

    if (songIds.length === 0) {
      return NextResponse.json({
        group_id: groupId,
        title: group.base_title_display || group.base_title_unaccent,
        versions: [],
      });
    }

    // Get all versions
    const { data: versions, error: versionsError } = await supabaseAdmin
      .from('kara_versions')
      .select('id, song_id, label, key, is_default')
      .in('song_id', songIds)
      .order('is_default', { ascending: false })
      .order('id', { ascending: true });

    if (versionsError) {
      throw new Error(`Failed to fetch versions: ${versionsError.message}`);
    }

    if (!versions || versions.length === 0) {
      return NextResponse.json({
        group_id: groupId,
        title: group.base_title_display || group.base_title_unaccent,
        versions: [],
      });
    }

    // Get files for these versions (only video files)
    const versionIds = versions.map((v: any) => v.id);
    const { data: files, error: filesError } = await supabaseAdmin
      .from('kara_files')
      .select('id, version_id, storage_path, type, duration_seconds')
      .in('version_id', versionIds)
      .eq('type', 'video');

    if (filesError) {
      throw new Error(`Failed to fetch files: ${filesError.message}`);
    }

    // Group files by version_id (take first file per version)
    const filesByVersion = new Map();
    (files || []).forEach((f: any) => {
      if (!filesByVersion.has(f.version_id)) {
        filesByVersion.set(f.version_id, f);
      }
    });

    // Format versions (only those with files)
    const formattedVersions = (versions || []).filter((v: any) => filesByVersion.has(v.id)).map((v: any) => {
      const file = filesByVersion.get(v.id);
      return {
        version_id: v.id,
        tone: v.label === 'nam' || v.label?.startsWith('nam_') ? 'nam' :
              v.label === 'nu' || v.label?.startsWith('nu_') ? 'nu' : null,
        pitch: v.key || null,
        styles: v.label ? [v.label] : [],
        duration_s: file?.duration_seconds || null,
        file: {
          file_id: file.id,
          storage_path: file.storage_path,
          play_url: buildPlayUrl(file.storage_path),
        },
      };
    });

    return NextResponse.json({
      group_id: groupId,
      title: group.base_title_display || group.base_title_unaccent,
      versions: formattedVersions,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    console.error('Error fetching group versions:', error);
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

