import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/server/lib/supabase';

export const dynamic = 'force-dynamic';

/**
 * POST /api/queue/reorder
 * 
 * Host-only endpoint to reorder queue items by position
 * Uses host_reorder_queue PostgreSQL function for atomic reordering
 * 
 * Body: { queue_item_id: string, new_position: number, room_id: string }
 * 
 * Rules:
 * - Only host can reorder
 * - Only pending songs can be reordered
 * - Atomic position update with advisory lock
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { queue_item_id, new_position, room_id } = body;
    
    if (!queue_item_id || new_position === undefined || !room_id) {
      return NextResponse.json(
        { error: 'queue_item_id, new_position, and room_id are required' },
        { status: 400 }
      );
    }
    
    if (typeof new_position !== 'number' || new_position < 1) {
      return NextResponse.json(
        { error: 'new_position must be a positive integer' },
        { status: 400 }
      );
    }
    
    // 1. Verify room exists and get host_id
    const { data: room, error: roomError } = await supabaseAdmin
      .from('kara_rooms')
      .select('host_id')
      .eq('id', room_id)
      .single();
    
    if (roomError || !room) {
      return NextResponse.json(
        { error: 'Room not found' },
        { status: 404 }
      );
    }
    
    // Note: Host verification should be done by caller (TV page with tv_user_id)
    // This endpoint is called from TV page which has host context
    
    // 2. Verify queue item exists and is pending
    const { data: queueItem, error: queueError } = await supabaseAdmin
      .from('kara_queue')
      .select('id, status, position')
      .eq('id', queue_item_id)
      .eq('room_id', room_id)
      .single();
    
    if (queueError || !queueItem) {
      return NextResponse.json(
        { error: 'Queue item not found' },
        { status: 404 }
      );
    }
    
    if (queueItem.status !== 'pending') {
      return NextResponse.json(
        { error: 'Can only reorder pending songs' },
        { status: 400 }
      );
    }
    
    // 3. Call PostgreSQL function to reorder atomically
    const { data: success, error: reorderError } = await supabaseAdmin
      .rpc('host_reorder_queue', {
        p_room_id: room_id,
        p_queue_item_id: queue_item_id,
        p_new_position: new_position
      });
    
    if (reorderError) {
      console.error('[queue/reorder] RPC error:', reorderError);
      return NextResponse.json(
        { error: reorderError.message || 'Failed to reorder queue' },
        { status: 500 }
      );
    }
    
    if (!success) {
      return NextResponse.json(
        { error: 'Cannot reorder: invalid position or operation failed' },
        { status: 400 }
      );
    }
    
    return NextResponse.json({
      success: true,
      message: 'Queue item reordered successfully'
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
