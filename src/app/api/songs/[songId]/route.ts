import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/server/lib/supabase';
import { config } from '@/server/config';

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
 * Get version by ID (updated for new schema)
 * In the new schema, version_id IS the song_id
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { songId: string } }
) {
  try {
    const { songId } = params;

    const { data: version, error } = await supabaseAdmin
      .from('kara_versions')
      .select(`
        id,
        title_display,
        title_clean,
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
      .eq('id', songId)
      .eq('kara_files.type', 'video')
      .single();

    if (error || !version) {
      return NextResponse.json(
        { error: 'Version not found' },
        { status: 404 }
      );
    }

    // Format response
    const file = Array.isArray(version.kara_files) ? version.kara_files[0] : version.kara_files;
    const result = {
      version_id: version.id,
      song_id: version.id, // version IS the song in new schema
      song_title: version.title_display,
      artist_name: version.artist_name || null,
      tone: version.tone || null,
      mixer: version.mixer || null,
      style: version.style || null,
      pitch: version.key || null,
      tempo: version.tempo || null,
      storage_path: file.storage_path,
      duration_seconds: file.duration_seconds || null,
      play_url: buildPlayUrl(file.storage_path),
    };

    return NextResponse.json({ version: result });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    console.error('Error fetching version:', error);
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

