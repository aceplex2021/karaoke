import { Router } from 'express';
import { supabaseAdmin } from '../lib/supabase';
import { QueueManager } from '../lib/queue';
import type {
  CreateRoomRequest,
  JoinRoomRequest,
  Room,
  User,
  RoomState,
  QueueItem,
} from '../../shared/types';

/**
 * Generate a unique 6-character room code
 */
async function generateUniqueRoomCode(): Promise<string> {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude confusing chars
  let code = '';
  
  // Try up to 10 times to find a unique code
  for (let attempt = 0; attempt < 10; attempt++) {
    code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    
    // Check if code exists
    const { data } = await supabaseAdmin
      .from('kara_rooms')
      .select('id')
      .eq('room_code', code)
      .single();
    
    if (!data) {
      return code; // Code is unique
    }
  }
  
  throw new Error('Failed to generate unique room code');
}

const router = Router();

/**
 * Create a new room (TV mode)
 */
router.post('/create', async (req, res) => {
  try {
    const { room_name, host_fingerprint, host_display_name }: CreateRoomRequest =
      req.body;

    if (!room_name || !host_fingerprint) {
      return res.status(400).json({
        error: 'room_name and host_fingerprint are required',
      });
    }

    // Get or create user
    let { data: user } = await supabaseAdmin
      .from('kara_users')
      .select('*')
      .eq('fingerprint', host_fingerprint)
      .single();

    if (!user) {
      const { data: newUser, error: userError } = await supabaseAdmin
        .from('kara_users')
        .insert({
          fingerprint: host_fingerprint,
          display_name: host_display_name || 'Host',
        })
        .select()
        .single();

      if (userError) {
        throw new Error(`Failed to create user: ${userError.message}`);
      }

      user = newUser;
    } else {
      // Update last seen
      await supabaseAdmin
        .from('kara_users')
        .update({ last_seen_at: new Date().toISOString() })
        .eq('id', user.id);
    }

    // Generate unique room code
    const roomCode = await generateUniqueRoomCode();

    // Create room
    const { data: room, error: roomError } = await supabaseAdmin
      .from('kara_rooms')
      .insert({
        room_code: roomCode,
        room_name,
        host_id: user.id,
      })
      .select()
      .single();

    if (roomError) {
      throw new Error(`Failed to create room: ${roomError.message}`);
    }

    // Add host as participant
    await supabaseAdmin.from('kara_room_participants').insert({
      room_id: room.id,
      user_id: user.id,
      role: 'host',
    });

    res.json({
      room: room as Room,
      user: user as User,
    });
  } catch (error: any) {
    console.error('Error creating room:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

/**
 * Get room by code
 */
router.get('/code/:code', async (req, res) => {
  try {
    const { code } = req.params;

    const { data: room, error } = await supabaseAdmin
      .from('kara_rooms')
      .select('*')
      .eq('room_code', code.toUpperCase())
      .eq('is_active', true)
      .single();

    if (error || !room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    res.json({ room: room as Room });
  } catch (error: any) {
    console.error('Error fetching room:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

/**
 * Get or load room (TV mode - persistent room)
 */
router.get('/:roomId', async (req, res) => {
  try {
    const { roomId } = req.params;

    const { data: room, error } = await supabaseAdmin
      .from('kara_rooms')
      .select('*')
      .eq('id', roomId)
      .eq('is_active', true)
      .single();

    if (error || !room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    res.json({ room: room as Room });
  } catch (error: any) {
    console.error('Error fetching room:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

/**
 * Join room (Phone mode)
 */
router.post('/join', async (req, res) => {
  try {
    const { room_code, user_fingerprint, display_name }: JoinRoomRequest =
      req.body;

    if (!room_code || !user_fingerprint) {
      return res.status(400).json({
        error: 'room_code and user_fingerprint are required',
      });
    }

    // Get room
    const { data: room, error: roomError } = await supabaseAdmin
      .from('kara_rooms')
      .select('*')
      .eq('room_code', room_code.toUpperCase())
      .eq('is_active', true)
      .single();

    if (roomError || !room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    // Get or create user (handle race condition for duplicate fingerprint)
    let user: any;
    const { data: existingUser } = await supabaseAdmin
      .from('kara_users')
      .select('*')
      .eq('fingerprint', user_fingerprint)
      .single();

    if (existingUser) {
      user = existingUser;
      // Update last seen and display name if provided
      await supabaseAdmin
        .from('kara_users')
        .update({
          last_seen_at: new Date().toISOString(),
          display_name: display_name || user.display_name,
        })
        .eq('id', user.id);
    } else {
      // Try to create user, but handle duplicate key error (race condition)
      const { data: newUser, error: insertError } = await supabaseAdmin
        .from('kara_users')
        .insert({
          fingerprint: user_fingerprint,
          display_name: display_name || 'Guest',
        })
        .select()
        .single();

      if (insertError) {
        // If duplicate key error, fetch the existing user
        if (insertError.code === '23505' || insertError.message.includes('duplicate')) {
          const { data: retryUser } = await supabaseAdmin
            .from('kara_users')
            .select('*')
            .eq('fingerprint', user_fingerprint)
            .single();
          if (retryUser) {
            user = retryUser;
          } else {
            throw new Error(`Failed to create user: ${insertError.message}`);
          }
        } else {
          throw new Error(`Failed to create user: ${insertError.message}`);
        }
      } else {
        user = newUser;
      }
    }

    // Add or update participant
    const { data: existingParticipant } = await supabaseAdmin
      .from('kara_room_participants')
      .select('*')
      .eq('room_id', room.id)
      .eq('user_id', user.id)
      .single();

    if (existingParticipant) {
      // Update last active
      await supabaseAdmin
        .from('kara_room_participants')
        .update({ last_active_at: new Date().toISOString() })
        .eq('id', existingParticipant.id);
    } else {
      // Add new participant
      await supabaseAdmin.from('kara_room_participants').insert({
        room_id: room.id,
        user_id: user.id,
        role: 'participant',
      });
    }

    res.json({
      room: room as Room,
      user: user as User,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    console.error('Error joining room:', error);
    res.status(500).json({ error: errorMessage });
  }
});

/**
 * Get room state (read-only, canonical source of truth)
 * Returns room + current song + queue + upNext in one call
 * Resolves all media URLs in a single batch query (no N+1)
 * This endpoint has no side effects (read-only)
 */
router.get('/:roomId/state', async (req, res) => {
  try {
    const { roomId } = req.params;

    // Import resolveMediaUrlsForQueue from queue routes
    const { resolveMediaUrlsForQueue } = await import('./queue');
    
    // Fetch room
    const { data: room, error: roomError } = await supabaseAdmin
      .from('kara_rooms')
      .select('*')
      .eq('id', roomId)
      .single();

    if (roomError || !room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    // Fetch current song (if any) - this is the playing item
    const currentSong = await QueueManager.getCurrentSong(roomId);

    // Fetch queue (pending only, ledger order) - exclude playing to avoid duplicates
    const { data: queueItems, error: queueError } = await supabaseAdmin
      .from('kara_queue')
      .select(`
        *,
        song: kara_songs(*),
        user: kara_users(*)
      `)
      .eq('room_id', roomId)
      .eq('status', 'pending') // Only pending items in queue
      .order('position', { ascending: true });

    if (queueError) {
      throw new Error(`Failed to fetch queue: ${queueError.message}`);
    }

    let queue = (queueItems || []) as QueueItem[];

    // Fetch up next (turn order, informational only)
    const upNext = await QueueManager.selectNextSong(roomId);

    // Collect unique items for media URL resolution
    // Use Map to ensure uniqueness by ID
    const itemsMap = new Map<string, QueueItem>();
    
    if (currentSong) {
      itemsMap.set(currentSong.id, currentSong);
    }
    if (upNext) {
      itemsMap.set(upNext.id, upNext);
    }
    // Add queue items (already filtered to pending, but ensure uniqueness)
    for (const item of queue) {
      itemsMap.set(item.id, item);
    }

    // Convert to array of unique items for batch resolution
    const uniqueItems = Array.from(itemsMap.values());

    // Single batch call to resolve all media URLs at once
    const itemsWithUrls = await resolveMediaUrlsForQueue(uniqueItems);

    // Create lookup map for resolved items
    const resolvedMap = new Map<string, QueueItem>();
    for (const item of itemsWithUrls) {
      resolvedMap.set(item.id, item);
    }

    // Map back to separate items using resolved data
    const currentWithUrl = currentSong 
      ? (resolvedMap.get(currentSong.id) || null)
      : null;
    const upNextWithUrl = upNext
      ? (resolvedMap.get(upNext.id) || null)
      : null;
    
    // Map queue items (pending only, exclude playing)
    // Ensure uniqueness by ID
    const queueWithUrlsMap = new Map<string, QueueItem>();
    for (const item of queue) {
      const resolved = resolvedMap.get(item.id);
      if (resolved) {
        queueWithUrlsMap.set(item.id, resolved);
      }
    }
    const queueWithUrls = Array.from(queueWithUrlsMap.values())
      .sort((a, b) => a.position - b.position); // Maintain ledger order

    const state: RoomState = {
      room: room as Room,
      currentSong: currentWithUrl,
      queue: queueWithUrls,
      upNext: upNextWithUrl
    };

    res.json(state);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    console.error('Error getting room state:', error);
    res.status(500).json({ error: errorMessage });
  }
});

export default router;

