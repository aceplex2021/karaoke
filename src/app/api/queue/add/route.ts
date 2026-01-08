import { NextRequest, NextResponse } from 'next/server';

// Mark route as dynamic
export const dynamic = 'force-dynamic';
import { supabaseAdmin } from '@/server/lib/supabase';
import { QueueManager } from '@/server/lib/queue';
import { config } from '@/server/config';
import { extractBasename } from '@/server/lib/media-url-resolver';
import type { AddToQueueRequest, QueueItem } from '@/shared/types';

/**
 * Add song to queue
 * Accepts either version_id (preferred) or song_id (legacy)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as AddToQueueRequest;
    const { room_id, song_id, version_id, user_id } = body;

    if (!room_id || !user_id) {
      return NextResponse.json(
        { error: 'room_id and user_id are required' },
        { status: 400 }
      );
    }

    // If version_id provided, get song_id from version
    let targetSongId = song_id;
    if (version_id && !song_id) {
      const { data: version, error: versionError } = await supabaseAdmin
        .from('kara_versions')
        .select('song_id')
        .eq('id', version_id)
        .single();

      if (versionError || !version) {
        return NextResponse.json(
          { error: 'Version not found' },
          { status: 404 }
        );
      }

      targetSongId = version.song_id;
    }

    if (!targetSongId) {
      return NextResponse.json(
        { error: 'Either song_id or version_id is required' },
        { status: 400 }
      );
    }

    const queueItem = await QueueManager.addToQueue(room_id, targetSongId, user_id, version_id);

    // Fetch with joined data
    const { data: fullItem, error } = await supabaseAdmin
      .from('kara_queue')
      .select(`
        *,
        song: kara_songs(*),
        user: kara_users(*)
      `)
      .eq('id', queueItem.id)
      .single();

    if (error) {
      throw new Error(`Failed to fetch queue item: ${error.message}`);
    }

    // Get version_id from queueItem (might be in memory if column doesn't exist)
    const itemVersionId = (queueItem as any).version_id || version_id;

    // Add media URL - prefer version file, fallback to song file_path
    if (itemVersionId) {
      try {
        const { data: versionData } = await supabaseAdmin
          .from('kara_versions')
          .select(`
            id,
            kara_files!inner(
              id,
              storage_path,
              type
            )
          `)
          .eq('id', itemVersionId)
          .eq('kara_files.type', 'video')
          .single();
        
        if (versionData && versionData.kara_files && versionData.kara_files.length > 0) {
          const file = Array.isArray(versionData.kara_files) 
            ? versionData.kara_files[0] 
            : versionData.kara_files;
          if (file.storage_path) {
            const basename = extractBasename(file.storage_path);
            (fullItem as any).song = (fullItem as any).song || {};
            (fullItem as any).song.media_url = `${config.mediaServer.baseUrl}/${encodeURIComponent(basename)}`;
            return NextResponse.json({ queueItem: fullItem as QueueItem });
          }
        }
      } catch (e) {
        console.log('Failed to fetch version file, using fallback:', e);
      }
    }
    
    // Fallback to song file_path (extract basename)
    if (fullItem.song && (fullItem.song as any).file_path) {
      const basename = extractBasename((fullItem.song as any).file_path);
      (fullItem as any).song.media_url = `${config.mediaServer.baseUrl}/${encodeURIComponent(basename)}`;
    }

    return NextResponse.json({ queueItem: fullItem as QueueItem });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    console.error('Error adding to queue:', error);
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

