import { supabaseAdmin } from './supabase';
import type { QueueItem, User } from '../../shared/types';
import { config } from '../config';

/**
 * Phase B: Backend-controlled queue management with atomic transitions
 * 
 * Invariants:
 * - Exactly one entry playing per room (enforced by DB partial unique index)
 * - Room pointer consistency (current_entry_id matches only playing entry)
 * - Atomic transitions (all state changes in single transaction)
 * - Idempotent endpoints (repeated calls are safe)
 */
export class QueueManager {
  /**
   * Calculate the next position for a new queue item
   * Phase B: Global order only - always append at end (max+1)
   * No per-singer FIFO insertion
   */
  static async calculateNextPosition(roomId: string): Promise<number> {
    const { data: queueItems, error } = await supabaseAdmin
      .from('kara_queue')
      .select('position')
      .eq('room_id', roomId)
      .in('status', ['pending', 'playing'])
      .order('position', { ascending: false })
      .limit(1);

    if (error) {
      throw new Error(`Failed to fetch queue: ${error.message}`);
    }

    if (!queueItems || queueItems.length === 0) {
      return 1;
    }

    // Always append at end (max+1)
    return queueItems[0].position + 1;
  }

  /**
   * Add song to queue (global order - append at end)
   */
  static async addToQueue(
    roomId: string,
    songId: string,
    userId: string,
    versionId?: string
  ): Promise<QueueItem> {
    const position = await this.calculateNextPosition(roomId);

    const insertData: any = {
      room_id: roomId,
      song_id: songId,
      user_id: userId,
      position,
      status: 'pending',
    };

    const { data, error } = await supabaseAdmin
      .from('kara_queue')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to add to queue: ${error.message}`);
    }

    // Store version_id in memory for this request (not in DB)
    if (versionId) {
      (data as any).version_id = versionId;
    }

    // Phase B: Self-healing - ensure playback continues if room is idle
    await this.ensurePlaying(roomId);

    return data as QueueItem;
  }

  /**
   * Select next song to play using round-robin algorithm
   * Priority: Host overrides > Round-robin (using last_singer_id) > FIFO per singer
   * 
   * Phase B: Uses last_singer_id cursor instead of deriving from current_entry_id
   */
  static async selectNextSong(roomId: string): Promise<QueueItem | null> {
    console.log(`[selectNextSong] Called for room ${roomId}`);
    // Get all pending items
    const { data: pendingItems, error } = await supabaseAdmin
      .from('kara_queue')
      .select(
        `
        *,
        song: kara_songs(*),
        user: kara_users(*)
      `
      )
      .eq('room_id', roomId)
      .eq('status', 'pending')
      .order('position', { ascending: true });

    console.log(`[selectNextSong] Query result:`, { 
      error: error ? { message: error.message, code: error.code } : null,
      pendingCount: pendingItems?.length || 0,
      pendingIds: pendingItems?.map((item: any) => item.id) || []
    });

    if (error || !pendingItems || pendingItems.length === 0) {
      return null;
    }

    // Priority 1: Host overrides (host_override = true)
    const hostOverrides = pendingItems.filter((item: any) => item.host_override);
    if (hostOverrides.length > 0) {
      hostOverrides.sort((a: any, b: any) => {
        const posA = a.host_override_position ?? a.position;
        const posB = b.host_override_position ?? b.position;
        return posA - posB;
      });
      return hostOverrides[0] as QueueItem;
    }

    // Priority 2: Round-robin among eligible singers
    // Eligible singers = singers with pending songs (no active cutoff)
    // Get room's last_singer_id cursor
    const { data: room } = await supabaseAdmin
      .from('kara_rooms')
      .select('last_singer_id')
      .eq('id', roomId)
      .single();

    const lastSingerId = room?.last_singer_id || null;

    // Eligible singers = all singers with pending songs
    const singersWithSongs = new Set(pendingItems.map((item: any) => item.user_id));
    const uniqueSingers = Array.from(singersWithSongs);

    if (uniqueSingers.length === 0) {
      // No singers, return first pending
      return pendingItems[0] as QueueItem;
    }

    // Build round-robin order: start after last_singer_id
    let userOrder: string[];
    if (lastSingerId && uniqueSingers.includes(lastSingerId)) {
      // Start after last singer
      const lastIndex = uniqueSingers.indexOf(lastSingerId);
      userOrder = [
        ...uniqueSingers.slice(lastIndex + 1),
        ...uniqueSingers.slice(0, lastIndex + 1)
      ];
    } else {
      // No last singer or not in current singers, start from beginning
      userOrder = uniqueSingers;
    }

    // Choose each singer's lowest-position pending entry
    for (const userId of userOrder) {
      const userSongs = pendingItems.filter((item: any) => item.user_id === userId);
      if (userSongs.length > 0) {
        // Return lowest-position entry for this singer
        userSongs.sort((a: any, b: any) => a.position - b.position);
        return userSongs[0] as QueueItem;
      }
    }

    // Fallback: return first pending item
    return pendingItems[0] as QueueItem;
  }

  /**
   * Start playing a song (backend authority, atomic)
   * Uses PostgreSQL function with advisory lock for serialization
   */
  static async startPlaying(roomId: string, queueItemId: string): Promise<QueueItem> {
    console.log(`[startPlaying] Called for room ${roomId}, queueItem ${queueItemId}`);
    // Use PostgreSQL function for atomic start
    // Note: Supabase RPC requires parameters in the exact order defined in the function
    // Function signature: start_playback(p_room_id UUID, p_entry_id UUID)
    const { data, error } = await supabaseAdmin.rpc('start_playback', {
      p_room_id: roomId,
      p_entry_id: queueItemId,
    });
    
    console.log(`[startPlaying] RPC result:`, { data, error: error ? { message: error.message, code: error.code, details: error.details } : null });

    if (error) {
      // Check if it's a constraint violation (another entry already playing)
      if (error.code === '23505' || error.message.includes('unique constraint')) {
        throw new Error('Another song is already playing in this room');
      }
      // Check if function doesn't exist (schema cache issue)
      if (error.message.includes('Could not find the function') || error.message.includes('schema cache')) {
        throw new Error(`Database function 'start_playback' not found. Please ensure the database schema is up to date. Error: ${error.message}`);
      }
      throw new Error(`Failed to start playback: ${error.message}`);
    }

    if (!data) {
      throw new Error('Failed to start playback: room already has a playing entry');
    }

    // Fetch full item with joined data
    const { data: fullItem, error: fetchError } = await supabaseAdmin
      .from('kara_queue')
      .select(
        `
        *,
        song: kara_songs(*),
        user: kara_users(*)
      `
      )
      .eq('id', queueItemId)
      .single();

    if (fetchError || !fullItem) {
      throw new Error(`Failed to fetch queue item: ${fetchError?.message}`);
    }

    return fullItem as QueueItem;
  }

  /**
   * Self-healing: Ensure room is playing if pending songs exist
   * Invoked when: song added, ended/error, host reorder, optionally on timer
   * Goal: room never stays idle if pending exists
   */
  static async ensurePlaying(roomId: string): Promise<void> {
    console.log(`[ensurePlaying] Called for room ${roomId}`);
    try {
      // Check if room already has a playing entry
      const { data: room } = await supabaseAdmin
        .from('kara_rooms')
        .select('current_entry_id')
        .eq('id', roomId)
        .single();

      console.log(`[ensurePlaying] Room current_entry_id:`, room?.current_entry_id);

      if (room?.current_entry_id) {
        // Verify the entry is actually playing (not stale)
        const { data: queueEntry } = await supabaseAdmin
          .from('kara_queue')
          .select('status, started_at')
          .eq('id', room.current_entry_id)
          .single();

        // If entry exists and is playing, room is active
        if (queueEntry && queueEntry.status === 'playing') {
          // Check if it's stale (started more than 2 hours ago - likely stuck)
          if (queueEntry.started_at) {
            const startedAt = new Date(queueEntry.started_at);
            const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
            if (startedAt < twoHoursAgo) {
              console.log(`Stale playing entry detected for room ${roomId}, clearing...`);
              // Clear stale entry - mark as completed and clear room pointer
              await supabaseAdmin
                .from('kara_queue')
                .update({ status: 'completed', completed_at: new Date().toISOString() })
                .eq('id', room.current_entry_id);
              await supabaseAdmin
                .from('kara_rooms')
                .update({ current_entry_id: null })
                .eq('id', roomId);
              // Fall through to start next song
            } else {
              // Entry is valid and recent, room is playing
              return;
            }
          } else {
            // Entry is playing but has no started_at (shouldn't happen, but handle it)
            return;
          }
        } else {
          // current_entry_id points to non-playing entry (stale pointer)
          console.log(`Stale current_entry_id detected for room ${roomId}, clearing...`);
          await supabaseAdmin
            .from('kara_rooms')
            .update({ current_entry_id: null })
            .eq('id', roomId);
          // Fall through to start next song
        }
      }

      // Room is idle, select and start next song
      console.log(`[ensurePlaying] Room is idle, selecting next song...`);
      const nextSong = await this.selectNextSong(roomId);
      console.log(`[ensurePlaying] selectNextSong returned:`, nextSong ? { id: nextSong.id, title: nextSong.song?.title } : null);
      if (nextSong) {
        console.log(`[ensurePlaying] Starting next song for room ${roomId}:`, nextSong.song?.title);
        await this.startPlaying(roomId, nextSong.id);
        console.log(`[ensurePlaying] startPlaying completed for room ${roomId}`);
      } else {
        console.log(`[ensurePlaying] No pending songs found for room ${roomId}`);
      }
    } catch (error: any) {
      // Log but don't throw - self-healing should be best-effort
      console.error(`[ensurePlaying] Self-healing failed for room ${roomId}:`, {
        message: error.message,
        stack: error.stack,
        error: error
      });
    }
  }

  /**
   * Handle playback ended (TV reports completion, idempotent)
   * Uses PostgreSQL function for atomic transition
   * Phase B: Self-healing - ensures next song starts via ensurePlaying()
   */
  static async handlePlaybackEnded(
    roomId: string,
    queueItemId: string
  ): Promise<void> {
    // Get queue item to get user_id and song_id for history
    const { data: queueItem } = await supabaseAdmin
      .from('kara_queue')
      .select('user_id, song_id, status')
      .eq('id', queueItemId)
      .single();

    if (!queueItem) {
      throw new Error('Queue item not found');
    }

    // Idempotency: if already completed/skipped, just ensure playing
    if (queueItem.status !== 'playing') {
      // Already processed, ensure next song starts if room is idle
      await this.ensurePlaying(roomId);
      return;
    }

    // Use PostgreSQL function for atomic transition (don't pass next_entry_id - ensurePlaying handles it)
    const { data: transitionResult, error } = await supabaseAdmin.rpc('transition_playback', {
      p_room_id: roomId,
      p_current_entry_id: queueItemId,
      p_new_status: 'completed',
      p_next_entry_id: null, // Let ensurePlaying handle next song selection
    });

    if (error) {
      throw new Error(`Failed to transition playback: ${error.message}`);
    }

    // Add to history (outside transaction, but safe if it fails)
    if (queueItem.user_id && queueItem.song_id) {
      const { data: existingHistory } = await supabaseAdmin
        .from('kara_song_history')
        .select('*')
        .eq('room_id', roomId)
        .eq('user_id', queueItem.user_id)
        .eq('song_id', queueItem.song_id)
        .single();

      if (existingHistory) {
        await supabaseAdmin
          .from('kara_song_history')
          .update({
            times_sung: existingHistory.times_sung + 1,
            sung_at: new Date().toISOString(),
          })
          .eq('id', existingHistory.id);
      } else {
        await supabaseAdmin.from('kara_song_history').insert({
          room_id: roomId,
          user_id: queueItem.user_id,
          song_id: queueItem.song_id,
          times_sung: 1,
        });
      }
    }

    // Phase B: Self-healing - ensure next song starts
    await this.ensurePlaying(roomId);
  }

  /**
   * Handle playback error (TV reports error, idempotent)
   * Uses PostgreSQL function for atomic transition
   */
  static async handlePlaybackError(
    roomId: string,
    queueItemId: string
  ): Promise<void> {
    // Get queue item to check status
    const { data: queueItem } = await supabaseAdmin
      .from('kara_queue')
      .select('status')
      .eq('id', queueItemId)
      .single();

    if (!queueItem) {
      throw new Error('Queue item not found');
    }

    // Idempotency: if already completed/skipped, just ensure playing
    if (queueItem.status !== 'playing') {
      // Already processed, ensure next song starts if room is idle
      await this.ensurePlaying(roomId);
      return;
    }

    // Use PostgreSQL function for atomic transition (don't pass next_entry_id - ensurePlaying handles it)
    const { data: transitionResult, error } = await supabaseAdmin.rpc('transition_playback', {
      p_room_id: roomId,
      p_current_entry_id: queueItemId,
      p_new_status: 'skipped', // Treat error as skip
      p_next_entry_id: null, // Let ensurePlaying handle next song selection
    });

    if (error) {
      throw new Error(`Failed to transition playback: ${error.message}`);
    }

    // Phase B: Self-healing - ensure next song starts
    await this.ensurePlaying(roomId);
  }

  /**
   * Get current playing song for a room
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

    const { data: queueItem, error } = await supabaseAdmin
      .from('kara_queue')
      .select(
        `
        *,
        song: kara_songs(*),
        user: kara_users(*)
      `
      )
      .eq('id', room.current_entry_id)
      .eq('status', 'playing')
      .single();

    if (error || !queueItem) {
      return null;
    }

    return queueItem as QueueItem;
  }

  /**
   * Skip song (backend-controlled, idempotent)
   * If skipping current entry, transitions to next
   * If skipping pending entry, just marks skipped
   */
  static async skipSong(roomId: string, queueItemId: string): Promise<void> {
    // Get queue item to check if it's current
    const { data: queueItem } = await supabaseAdmin
      .from('kara_queue')
      .select('status')
      .eq('id', queueItemId)
      .single();

    if (!queueItem) {
      throw new Error('Queue item not found');
    }

    // Check if this is the current playing entry
    const { data: room } = await supabaseAdmin
      .from('kara_rooms')
      .select('current_entry_id')
      .eq('id', roomId)
      .single();

    if (room?.current_entry_id === queueItemId && queueItem.status === 'playing') {
      // Skipping current entry - use error handler (same logic)
      await this.handlePlaybackError(roomId, queueItemId);
    } else {
      // Skipping pending entry - just mark skipped
      const { error } = await supabaseAdmin
        .from('kara_queue')
        .update({
          status: 'skipped',
          completed_at: new Date().toISOString(),
        })
        .eq('id', queueItemId)
        .eq('status', 'pending'); // Only update if pending (idempotent)

      if (error) {
        throw new Error(`Failed to skip song: ${error.message}`);
      }

      // Phase B: Self-healing - ensure playback continues if room is idle
      await this.ensurePlaying(roomId);
    }
  }

  /**
   * Remove song from queue
   */
  static async removeFromQueue(queueItemId: string, roomId: string): Promise<void> {
    const { error } = await supabaseAdmin
      .from('kara_queue')
      .delete()
      .eq('id', queueItemId)
      .eq('room_id', roomId)
      .eq('status', 'pending'); // Only allow removing pending items

    if (error) {
      throw new Error(`Failed to remove from queue: ${error.message}`);
    }
  }

  /**
   * Host reorder queue (overrides round-robin, atomic)
   * Uses PostgreSQL function with advisory lock for serialization
   * Phase B: Self-healing - ensures playback continues if room is idle
   */
  static async hostReorderQueue(
    roomId: string,
    queueItemId: string,
    newPosition: number
  ): Promise<void> {
    // Use PostgreSQL function for atomic reorder
    const { data, error } = await supabaseAdmin.rpc('host_reorder_queue', {
      p_room_id: roomId,
      p_queue_item_id: queueItemId,
      p_new_position: newPosition,
    });

    if (error) {
      throw new Error(`Failed to reorder queue: ${error.message}`);
    }

    if (!data) {
      throw new Error('Failed to reorder queue: item not found or cannot be reordered');
    }

    // Phase B: Self-healing - ensure playback continues if room is idle
    await this.ensurePlaying(roomId);
  }
}
