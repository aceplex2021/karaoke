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
 * 
 * Phase 2.1: Optional activity tracking (updates last_active_at if userId provided)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  try {
    const { roomId } = await params;
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId'); // Phase 2.1: Optional userId for activity tracking
    
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

    // Phase 1: Check if room has expired
    if (room.expires_at && new Date(room.expires_at) < new Date()) {
      // Room has expired, mark as inactive
      await supabaseAdmin
        .from('kara_rooms')
        .update({ is_active: false })
        .eq('id', room.id);
      
      return NextResponse.json(
        { error: 'Room has expired' },
        { status: 410 } // 410 Gone
      );
    }

    // Also check is_active flag (defense in depth)
    if (!room.is_active) {
      return NextResponse.json(
        { error: 'Room is not active' },
        { status: 410 } // 410 Gone
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
        
        const user = data.kara_users || null;
        
        // Flatten display fields
        const title = data.source_type === 'youtube' 
          ? (data.metadata?.title || data.youtube_url || 'YouTube Video')
          : (version?.title_display || 'Unknown');
        const artist = data.source_type === 'youtube'
          ? 'YouTube'
          : (version?.artist_name || null);
        const user_name = user?.display_name || user?.username || 'Anonymous';
        
        currentSong = {
          ...data,
          title,
          artist,
          user_name,
          version,
          song,
          user
        } as QueueItem;
      }
    }
    
    // 3. Get pending queue (ordered by sort_key for v4.7.0 optimization)
    // v4.7.0: Always order by sort_key, which handles both FIFO and round-robin
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
      .order('sort_key', { ascending: true }); // v4.7.0: Use sort_key instead of position
    
    // Queue already sorted by sort_key
    const queueData = queueDataRaw;
    
    if (queueError) {
      console.error('[state] Queue query error:', queueError);
    }
    
    // Log before mapping
    console.log('[state] Queue raw data:', {
      roomId,
      count: queueDataRaw?.length || 0,
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
      
      const user = item.kara_users || null;
      
      // Flatten display fields for easier access (QueueItem interface expects these)
      // For YouTube: extract from metadata JSON or fallback to URL
      // For database: use version info
      const title = item.source_type === 'youtube' 
        ? (item.metadata?.title || item.youtube_url || 'YouTube Video')
        : (version?.title_display || 'Unknown');
      const artist = item.source_type === 'youtube'
        ? 'YouTube'
        : (version?.artist_name || null);
      const user_name = user?.display_name || user?.username || 'Anonymous';
      
      return {
        ...item,
        title,
        artist,
        user_name,
        version,
        song,
        user
      };
    }) as QueueItem[];
    
    // Log after mapping
    console.log('[state] Queue mapped data:', {
      count: queue.length,
      firstItem: queue[0] ? {
        id: queue[0].id,
        title: queue[0].title,
        artist: queue[0].artist,
        user_name: queue[0].user_name,
        source_type: queue[0].source_type,
        youtube_url: queue[0].youtube_url
      } : null
    });
    
    // 4. Get next song (first in queue for upNext display)
    const upNext = queue.length > 0 ? queue[0] : null;
    
    // Phase 2.1: Update last_active_at for user (debounced to once per minute)
    // Only update if userId provided and user is a participant
    if (userId) {
      try {
        // Check if user is a participant
        const { data: participant } = await supabaseAdmin
          .from('kara_room_participants')
          .select('id, last_active_at')
          .eq('room_id', roomId)
          .eq('user_id', userId)
          .eq('status', 'approved')
          .single();
        
        if (participant) {
          // Debounce: Only update if last update was >1 minute ago
          const lastActive = participant.last_active_at ? new Date(participant.last_active_at) : null;
          const now = new Date();
          const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);
          
          if (!lastActive || lastActive < oneMinuteAgo) {
            // Update last_active_at (debounced to once per minute)
            await supabaseAdmin
              .from('kara_room_participants')
              .update({ last_active_at: now.toISOString() })
              .eq('id', participant.id);
            
            console.log('[state] Updated last_active_at for user:', userId);
          }
        }
      } catch (error) {
        // Don't fail the request if activity tracking fails
        console.warn('[state] Failed to update last_active_at:', error);
      }
    }
    
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
