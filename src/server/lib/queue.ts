import { supabaseAdmin } from './supabase';
import type { QueueItem } from '@/shared/types';

/**
 * QueueManager - Minimal helper methods
 * 
 * RULES:
 * - Read-only helpers (no business logic)
 * - No auto-start logic
 * - No state transitions (use /advance endpoint)
 * - Simple queries only
 * 
 * Was: 600+ lines with complex logic
 * Now: ~50 lines with simple queries
 */
export class QueueManager {
  /**
   * Get current playing song for a room
   * Used by: /api/rooms/[roomId]/state
   */
  static async getCurrentSong(roomId: string): Promise<QueueItem | null> {
    const { data: room } = await supabaseAdmin
      .from('kara_rooms')
      .select('current_entry_id')
      .eq('id', roomId)
      .single();
    
    if (!room?.current_entry_id) {
      return null;
    }
    
    const { data } = await supabaseAdmin
      .from('kara_queue')
      .select(`
        *,
        kara_versions!version_id (
          *,
          kara_songs!song_id (*)
        ),
        kara_users!user_id (*)
      `)
      .eq('id', room.current_entry_id)
      .eq('status', 'playing')
      .single();
    
    if (!data) {
      return null;
    }
    
    // Map for backward compatibility
    return {
      ...data,
      version: data.kara_versions || null,
      song: data.kara_versions?.kara_songs || null,
      user: data.kara_users || null
    } as QueueItem;
  }
  
  /**
   * Get next pending song (for upNext display)
   * Used by: /api/rooms/[roomId]/state
   */
  static async getNextSong(roomId: string): Promise<QueueItem | null> {
    const { data } = await supabaseAdmin
      .from('kara_queue')
      .select(`
        *,
        kara_versions!version_id (
          *,
          kara_songs!song_id (*)
        ),
        kara_users!user_id (*)
      `)
      .eq('room_id', roomId)
      .eq('status', 'pending')
      .order('position', { ascending: true })
      .limit(1)
      .maybeSingle();
    
    if (!data) {
      return null;
    }
    
    // Map for backward compatibility
    return {
      ...data,
      version: data.kara_versions || null,
      song: data.kara_versions?.kara_songs || null,
      user: data.kara_users || null
    } as QueueItem;
  }
}

// That's it! No ensurePlaying, no auto-start, no complex logic
// Business logic lives in:
// - /advance endpoint (state transitions)
// - PostgreSQL functions (atomic operations)
// - TV page (playback lifecycle)
