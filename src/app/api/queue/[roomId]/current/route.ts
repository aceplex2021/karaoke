import { NextRequest, NextResponse } from 'next/server';
import { QueueManager } from '@/server/lib/queue';
import { supabaseAdmin } from '@/server/lib/supabase';
import { config } from '@/server/config';
import { extractBasename } from '@/server/lib/media-url-resolver';

/**
 * Get current playing song (TV mode - backend authority)
 * Returns the song URL from rooms.current_entry_id
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { roomId: string } }
) {
  try {
    const { roomId } = params;

    const currentSong = await QueueManager.getCurrentSong(roomId);

    if (!currentSong) {
      return NextResponse.json({ queueItem: null });
    }

    // Add media URL to song
    if (currentSong.song && currentSong.song_id) {
      try {
        const { data: versions } = await supabaseAdmin
          .from('kara_versions')
          .select(`
            id,
            label,
            kara_files!inner(
              id,
              storage_path,
              type
            )
          `)
          .eq('song_id', currentSong.song_id)
          .eq('kara_files.type', 'video');

        if (versions && versions.length > 0) {
          // Find best version (prefer "nam", non-remix)
          const namVersion = versions.find((v: any) => 
            v.kara_files && v.kara_files.length > 0 && 
            v.label && (v.label === 'nam' || v.label.startsWith('nam_')) &&
            !v.label.includes('remix')
          );
          const bestVersion = namVersion || versions[0];
          
          if (bestVersion && bestVersion.kara_files && bestVersion.kara_files.length > 0) {
            const file = Array.isArray(bestVersion.kara_files) 
              ? bestVersion.kara_files[0] 
              : bestVersion.kara_files;
            if (file.storage_path) {
              const basename = extractBasename(file.storage_path);
              (currentSong as any).song.media_url = `${config.mediaServer.baseUrl}/${encodeURIComponent(basename)}`;
              return NextResponse.json({ queueItem: currentSong });
            }
          }
        }
      } catch (e) {
        console.log('Failed to fetch version file:', e);
      }
    }

    // Fallback to song file_path (extract basename)
    if (currentSong.song && (currentSong.song as any).file_path) {
      const basename = extractBasename((currentSong.song as any).file_path);
      (currentSong as any).song.media_url = `${config.mediaServer.baseUrl}/${encodeURIComponent(basename)}`;
    }

    return NextResponse.json({ queueItem: currentSong });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    console.error('Error getting current song:', error);
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

