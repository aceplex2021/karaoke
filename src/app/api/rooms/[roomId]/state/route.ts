import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/server/lib/supabase';
import { config } from '@/server/config';
import type { RoomState, QueueItem, Room } from '@/shared/types';

// Force dynamic rendering - NO caching anywhere
export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Extract basename (filename only) from storage_path
 * Removes folder prefixes, UUID suffixes, and encoded slashes
 */
function extractBasename(storagePath: string): string {
  if (!storagePath) return '';
  const decoded = decodeURIComponent(storagePath);
  const parts = decoded.trim().replace(/^[/\\]+|[/\\]+$/g, '').split(/[/\\]+/);
  let basename = parts[parts.length - 1].replace(/%2F/gi, '').replace(/^Videos[/\\]/i, '');
  
  // Remove UUID suffix pattern: __[8-char-hex] before file extension
  // Example: "Song__c9c0a719.mp4" -> "Song.mp4"
  basename = basename.replace(/__[a-f0-9]{8,}(\.[^.]+)$/i, '$1');
  
  return basename;
}

/**
 * GET /api/rooms/[roomId]/state
 * 
 * Pure read endpoint - ZERO side effects
 * Returns current room state as single source of truth
 * 
 * Rules enforced:
 * - No auto-start logic
 * - No state inference
 * - No caching
 * - Returns ONLY what's in database
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { roomId: string } }
) {
  try {
    const { roomId } = params;
    
    // 1. Get room metadata
    const { data: room, error: roomError } = await supabaseAdmin
      .from('kara_rooms')
      .select('*')
      .eq('id', roomId)
      .single();
    
    if (roomError || !room) {
      return NextResponse.json(
        { error: 'Room not found' },
        { status: 404 }
      );
    }
    
    // 2. Get current playing song (if any)
    let currentSong: QueueItem | null = null;
    if (room.current_entry_id) {
      const { data } = await supabaseAdmin
        .from('kara_queue')
        .select(`
          *,
          kara_versions!version_id (
            id,
            title_display,
            tone,
            mixer,
            style,
            artist_name,
            performance_type,
            kara_files!version_id (storage_path, type, duration_seconds)
          ),
          kara_users!user_id (*)
        `)
        .eq('id', room.current_entry_id)
        .eq('status', 'playing')
        .single();
      
      if (data) {
        const version = data.kara_versions || null;
        const files = version?.kara_files || [];
        
        // Construct media_url from kara_files
        let media_url = null;
        
        // Find video file
        const videoFiles = Array.isArray(files) ? files : (files ? [files] : []);
        const videoFile = videoFiles.find((f: any) => f.type === 'video');
        
        if (videoFile && videoFile.storage_path) {
          const basename = extractBasename(videoFile.storage_path);
          media_url = `${config.mediaServer.baseUrl}/${encodeURIComponent(basename)}`;
        }
        
        // Map to legacy Song format for backward compatibility
        const song = version ? {
          id: version.id,
          title: version.title_display,
          artist: version.artist_name || null,
          language: 'vi', // Default language
          youtube_id: null,
          file_path: videoFile?.storage_path || '',
          duration: videoFile?.duration_seconds || null,
          created_at: data.added_at,
          media_url
        } : null;
        
        currentSong = {
          ...data,
          version,
          song,
          user: data.kara_users || null
        } as QueueItem;
      }
    }
    
    // 3. Get pending queue (ordered by queue_mode)
    // Round-robin: order by round_number first, then position
    // FIFO: order by position only
    const { data: queueDataRaw, error: queueError } = await supabaseAdmin
      .from('kara_queue')
      .select(`
        *,
        kara_versions!version_id (
          id,
          title_display,
          tone,
          mixer,
          style,
          artist_name,
          performance_type,
          kara_files!version_id (storage_path, type, duration_seconds)
        ),
        kara_users!user_id (*)
      `)
      .eq('room_id', roomId)
      .eq('status', 'pending')
      .order('position', { ascending: true });
    
    // Sort by queue_mode: round-robin needs round_number first, then position
    const queueData = queueDataRaw ? (room.queue_mode === 'round_robin'
      ? [...queueDataRaw].sort((a, b) => {
          const roundA = a.round_number || 0;
          const roundB = b.round_number || 0;
          if (roundA !== roundB) {
            return roundA - roundB;
          }
          return (a.position || 0) - (b.position || 0);
        })
      : queueDataRaw) : null;
    
    if (queueError) {
      console.error('[state] Queue query error:', queueError);
    }
    
    console.log('[state] Queue query result:', {
      roomId,
      count: queueData?.length || 0,
      firstItem: queueData?.[0] ? {
        id: queueData[0].id,
        version: queueData[0].kara_versions,
        files: queueData[0].kara_versions?.kara_files
      } : null
    });
    
    // Map queue items for backward compatibility
    const queue = (queueData || []).map(item => {
      const version = item.kara_versions || null;
      const files = version?.kara_files || [];
      
      // Construct media_url from kara_files
      let media_url = null;
      
      // Find video file
      const videoFiles = Array.isArray(files) ? files : (files ? [files] : []);
      const videoFile = videoFiles.find((f: any) => f.type === 'video');
      
      if (videoFile && videoFile.storage_path) {
        const basename = extractBasename(videoFile.storage_path);
        media_url = `${config.mediaServer.baseUrl}/${encodeURIComponent(basename)}`;
      }
      
      // Map to legacy Song format
      const song = version ? {
        id: version.id,
        title: version.title_display,
        artist: version.artist_name || null,
        language: 'vi',
        youtube_id: null,
        file_path: videoFile?.storage_path || '',
        duration: videoFile?.duration_seconds || null,
        created_at: item.added_at,
        media_url
      } : null;
      
      return {
        ...item,
        version,
        song,
        user: item.kara_users || null
      };
    }) as QueueItem[];
    
    // 4. Get next song (first in queue for upNext display)
    const upNext = queue.length > 0 ? queue[0] : null;
    
    // 5. Return state (pure data, no business logic)
    const state: RoomState = {
      room: room as Room,
      currentSong,
      queue,
      upNext
    };
    
    return NextResponse.json(state, {
      headers: {
        // STRICT no-cache headers
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Surrogate-Control': 'no-store'
      }
    });
    
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    console.error('[state] Error:', error);
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
