import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/server/lib/supabase';
import { config } from '@/server/config';
import type { GroupVersionsResponse, GroupVersion } from '@/shared/types';

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
 * Get all versions for a song group (updated for new schema)
 * In new schema: kara_versions directly references group_id
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

    // Get all versions in this group directly (no more members table)
    const { data: versions, error: versionsError } = await supabaseAdmin
      .from('kara_versions')
      .select(`
        id,
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
      .order('tone', { ascending: true })
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

    // Format versions
    const formattedVersions: GroupVersion[] = versions
      .filter(v => v.kara_files && v.kara_files.length > 0)
      .map((v: any) => {
        const file = Array.isArray(v.kara_files) ? v.kara_files[0] : v.kara_files;
        
        return {
          version_id: v.id,
          label: v.label || null,
          tone: v.tone || null,
          pitch: v.key || null,
          tempo: v.tempo || null,
          style: v.style || null,
          channel: v.mixer || null,
          performance_type: v.performance_type || 'solo',
          artist_name: v.artist_name || null,
          is_default: v.is_default || false,
          styles: v.label ? [v.label] : [],
          duration_s: file.duration_seconds || null,
          file: {
            file_id: file.id,
            storage_path: file.storage_path,
            play_url: buildPlayUrl(file.storage_path),
          },
        };
      });

    console.log(`[group/versions] Found ${formattedVersions.length} versions for group ${groupId}`);

    return NextResponse.json({
      group_id: groupId,
      title: group.base_title_display || group.base_title_unaccent,
      versions: formattedVersions,
    } as GroupVersionsResponse);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    console.error('Error fetching group versions:', error);
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

