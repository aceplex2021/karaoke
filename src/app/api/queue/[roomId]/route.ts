import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/server/lib/supabase';
import { config } from '@/server/config';
import { extractBasename } from '@/server/lib/media-url-resolver';
import type { QueueItem } from '@/shared/types';

/**
 * Get queue for a room
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { roomId: string } }
) {
  try {
    const { roomId } = params;

    const { data: queueItems, error } = await supabaseAdmin
      .from('kara_queue')
      .select(`
        *,
        song: kara_songs(*),
        user: kara_users(*)
      `)
      .eq('room_id', roomId)
      .in('status', ['pending', 'playing', 'completed', 'skipped'])
      .order('position', { ascending: true });

    if (error) {
      throw new Error(`Failed to fetch queue: ${error.message}`);
    }

    // Add full media URL to songs
    // Since version_id column doesn't exist, we'll get the best version for each song
    const queueWithUrls = await Promise.all((queueItems || []).map(async (item: any) => {
      if (!item.song || !item.song_id) {
        return item;
      }

      // Get the best version for this song (prefer "nam", non-remix)
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
          .eq('song_id', item.song_id)
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
              item.song.media_url = `${config.mediaServer.baseUrl}/${encodeURIComponent(basename)}`;
              return item;
            }
          }
        }
      } catch (e) {
        console.log('Failed to fetch version file:', e);
      }
      
      // Fallback to song file_path if it exists (extract basename)
      if (item.song.file_path) {
        const basename = extractBasename(item.song.file_path);
        item.song.media_url = `${config.mediaServer.baseUrl}/${encodeURIComponent(basename)}`;
      }
      return item;
    }));

    return NextResponse.json({ queue: queueWithUrls as QueueItem[] });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    console.error('Error fetching queue:', error);
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

