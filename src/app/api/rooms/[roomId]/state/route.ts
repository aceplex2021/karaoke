import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/server/lib/supabase';
import { QueueManager } from '@/server/lib/queue';
import { resolveMediaUrlsForQueue } from '@/server/lib/media-url-resolver';
import type { RoomState, QueueItem, Room } from '@/shared/types';

/**
 * Get room state (read-only, canonical source of truth)
 * Returns room + current song + queue + upNext in one call
 * Resolves all media URLs in a single batch query (no N+1)
 * This endpoint has no side effects (read-only)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { roomId: string } }
) {
  try {
    const { roomId } = params;
    
    // Fetch room
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

    return NextResponse.json(state);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    console.error('Error getting room state:', error);
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

