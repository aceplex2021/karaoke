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
 * Clean tone from label (remove style suffixes)
 */
function cleanTone(label: string | null, parsedTone: string | null): string | null {
  // Use parsed tone if available
  if (parsedTone) return parsedTone;
  
  if (!label) return null;
  
  // Extract base tone from label
  if (label.startsWith('nam')) return 'Nam';
  if (label.startsWith('nu')) return 'Nữ';
  if (label === 'original' || label === 'beat') return null;
  
  return null;
}

/**
 * Extract style from label (beat, bolero, ballad, remix, etc.)
 */
function extractStyle(label: string | null, parsedStyle: string | null): string | null {
  // Use parsed style if available
  if (parsedStyle) return parsedStyle;
  
  if (!label) return null;
  
  // Extract style suffix from label
  if (label.includes('_beat')) return 'Beat';
  if (label.includes('_bolero')) return 'Bolero';
  if (label.includes('_ballad')) return 'Ballad';
  if (label.includes('_remix')) return 'Remix';
  if (label === 'bolero') return 'Bolero';
  if (label === 'beat') return 'Beat';
  if (label === 'remix') return 'Remix';
  if (label === 'ballad') return 'Ballad';
  
  return null;
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

    // Get all versions with complete metadata (including artist and performance_type from song)
    const { data: versions, error: versionsError } = await supabaseAdmin
      .from('kara_versions')
      .select(`
        id, 
        song_id, 
        label, 
        key, 
        tempo, 
        is_default,
        song:kara_songs!kara_versions_song_id_fkey(artist_name, performance_type)
      `)
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

    // Get files for these versions (only video files) with parsed metadata from view
    const versionIds = versions.map((v: any) => v.id);
    const { data: files, error: filesError } = await supabaseAdmin
      .from('kara_files')
      .select('id, version_id, storage_path, type, duration_seconds')
      .in('version_id', versionIds)
      .eq('type', 'video');

    if (filesError) {
      throw new Error(`Failed to fetch files: ${filesError.message}`);
    }

    // Get parsed metadata from view for these files
    const fileIds = (files || []).map((f: any) => f.id);
    console.log('[versions] Fetching parsed metadata for', fileIds.length, 'files');
    const { data: parsedFiles, error: parsedError } = await supabaseAdmin
      .from('kara_files_parsed_preview')
      .select('id, tone, key, style, mixer, version_type')
      .in('id', fileIds);

    if (parsedError) {
      console.error('[versions] Failed to fetch parsed metadata:', parsedError);
    } else {
      console.log('[versions] Fetched', parsedFiles?.length || 0, 'parsed files');
      if (parsedFiles && parsedFiles.length > 0) {
        console.log('[versions] Sample parsed file:', parsedFiles[0]);
      }
    }

    // Create map of parsed metadata by file id
    const parsedByFileId = new Map();
    (parsedFiles || []).forEach((p: any) => {
      parsedByFileId.set(p.id, p);
    });

    // Group files by version_id (take first file per version)
    const filesByVersion = new Map();
    (files || []).forEach((f: any) => {
      if (!filesByVersion.has(f.version_id)) {
        filesByVersion.set(f.version_id, f);
      }
    });

    // Format versions (only those with files)
    let firstVersionLogged = false;
    const formattedVersions = (versions || []).filter((v: any) => filesByVersion.has(v.id)).map((v: any) => {
      const file = filesByVersion.get(v.id);
      const parsed = parsedByFileId.get(file.id) || {};
      
      const formatted = {
        version_id: v.id,
        label: v.label || null,  // Raw label for backward compatibility
        tone: cleanTone(v.label, parsed.tone),  // Clean tone (just Nam/Nữ)
        pitch: parsed.key || v.key || null,  // Use parsed key or fallback to version key
        tempo: v.tempo || null,  // BPM (from version table)
        style: extractStyle(v.label, parsed.style),  // Style from label or filename
        channel: parsed.mixer || null,  // Renamed from mixer to channel
        version_type: parsed.version_type || null,  // Version type from filename (Beat Chuẩn, Beat Gốc, Acoustic)
        performance_type: v.song?.performance_type || 'solo',  // Format: solo/duet/group/medley
        artist_name: v.song?.artist_name || null,  // Artist from kara_songs table
        is_default: v.is_default || false,  // Recommended version flag
        styles: v.label ? [v.label] : [],
        duration_s: file?.duration_seconds || null,
        file: {
          file_id: file.id,
          storage_path: file.storage_path,
          play_url: buildPlayUrl(file.storage_path),
        },
      };
      
      // Log first version for debugging
      if (!firstVersionLogged) {
        console.log('[versions] Sample formatted version:', {
          version_id: formatted.version_id,
          tone: formatted.tone,
          channel: formatted.channel,
          version_type: formatted.version_type,
          style: formatted.style,
          pitch: formatted.pitch,
          parsed_data: parsed,
          file_id: file.id,
        });
        firstVersionLogged = true;
      }
      
      return formatted;
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

