import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/server/lib/supabase';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/queue/item/[queueItemId]/reorder
 * 
 * Reorder a queue item
 * 
 * Body: { direction: 'up' | 'down', user_id: string, room_id?: string }
 * 
 * Rules:
 * - Can only reorder songs in 'pending' status
 * - User can reorder their own songs
 * - Host can reorder ANY song (when room_id is provided)
 * - Changes position atomically using PostgreSQL function
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { queueItemId: string } }
) {
  try {
    const { queueItemId } = params;
    const body = await request.json();
    const { direction, user_id, room_id } = body;
    
    if (!direction || !user_id) {
      return NextResponse.json(
        { error: 'direction and user_id are required' },
        { status: 400 }
      );
    }
    
    if (direction !== 'up' && direction !== 'down') {
      return NextResponse.json(
        { error: 'direction must be "up" or "down"' },
        { status: 400 }
      );
    }
    
    // 1. Get queue item and verify ownership
    const { data: queueItem, error: fetchError } = await supabaseAdmin
      .from('kara_queue')
      .select('id, user_id, room_id, position, status')
      .eq('id', queueItemId)
      .single();
    
    if (fetchError || !queueItem) {
      return NextResponse.json(
        { error: 'Queue item not found' },
        { status: 404 }
      );
    }
    
    // 2. Verify authorization (user owns song OR user is host)
    let isAuthorized = false;
    
    // Option 1: User is reordering their own song
    if (queueItem.user_id === user_id) {
      isAuthorized = true;
      console.log('[PATCH queue/reorder] User is reordering their own song');
    }
    
    // Option 2: User is the host (if room_id is provided)
    if (!isAuthorized && room_id) {
      const { data: room, error: roomError } = await supabaseAdmin
        .from('kara_rooms')
        .select('host_id')
        .eq('id', room_id)
        .single();
      
      if (!roomError && room && room.host_id === user_id) {
        isAuthorized = true;
        console.log('[PATCH queue/reorder] User is host, allowing reorder of any song');
      }
    }
    
    if (!isAuthorized) {
      console.error('[PATCH queue/reorder] Unauthorized:', {
        queueItemUserId: queueItem.user_id,
        requestUserId: user_id,
        roomId: room_id,
      });
      return NextResponse.json(
        { error: 'You can only reorder your own songs (or any song as host)' },
        { status: 403 }
      );
    }
    
    // 3. Verify status (can only reorder pending)
    if (queueItem.status !== 'pending') {
      return NextResponse.json(
        { error: 'Can only reorder pending songs' },
        { status: 400 }
      );
    }
    
    // 4. Determine if user is host
    let isHost = false;
    if (room_id) {
      const { data: room, error: roomError } = await supabaseAdmin
        .from('kara_rooms')
        .select('host_id')
        .eq('id', room_id)
        .single();
      
      if (!roomError && room && room.host_id === user_id) {
        isHost = true;
      }
    }
    
    // 5. Call appropriate PostgreSQL function
    let success: boolean = false;
    let reorderError: any = null;
    
    if (isHost) {
      // Host reordering ANY song (including their own) - use host_reorder_queue
      // Host sees full queue, so we need to reorder across all users
      console.log('[PATCH queue/reorder] Host detected - using host_reorder_queue');
      
      // Get all pending songs to calculate new position
      const { data: allPending, error: fetchError } = await supabaseAdmin
        .from('kara_queue')
        .select('id, position')
        .eq('room_id', queueItem.room_id)
        .eq('status', 'pending')
        .order('position', { ascending: true });
      
      if (fetchError || !allPending) {
        return NextResponse.json(
          { error: 'Failed to fetch queue' },
          { status: 500 }
        );
      }
      
      const currentIndex = allPending.findIndex(q => q.id === queueItemId);
      if (currentIndex === -1) {
        return NextResponse.json(
          { error: 'Queue item not found in pending list' },
          { status: 404 }
        );
      }
      
      // Calculate target index
      const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
      
      if (targetIndex < 0 || targetIndex >= allPending.length) {
        return NextResponse.json(
          { error: 'Cannot reorder: already at top/bottom' },
          { status: 400 }
        );
      }
      
      const newPosition = allPending[targetIndex].position;
      
      const { data: hostSuccess, error: hostError } = await supabaseAdmin
        .rpc('host_reorder_queue', {
          p_room_id: queueItem.room_id,
          p_queue_item_id: queueItemId,
          p_new_position: newPosition
        });
      
      success = hostSuccess || false;
      reorderError = hostError;
    } else {
      // Regular user reordering their own song - use user_reorder_queue
      console.log('[PATCH queue/reorder] Regular user - using user_reorder_queue');
      
      const { data: userSuccess, error: userError } = await supabaseAdmin
        .rpc('user_reorder_queue', {
          p_queue_item_id: queueItemId,
          p_user_id: user_id,
          p_direction: direction
        });
      
      success = userSuccess || false;
      reorderError = userError;
    }
    
    if (reorderError) {
      console.error('[queue/reorder] RPC error:', reorderError);
      return NextResponse.json(
        { error: reorderError.message || 'Failed to reorder song' },
        { status: 500 }
      );
    }
    
    if (!success) {
      return NextResponse.json(
        { error: 'Cannot reorder: already at top/bottom or invalid operation' },
        { status: 400 }
      );
    }
    
    return NextResponse.json({
      success: true,
      message: `Song moved ${direction}`
    });
    
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    console.error('[queue/reorder] Error:', error);
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
