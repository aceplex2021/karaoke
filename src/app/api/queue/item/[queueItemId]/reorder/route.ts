import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/server/lib/supabase';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/queue/item/[queueItemId]/reorder
 * 
 * Reorder a queue item (user can only reorder their own songs)
 * 
 * Body: { direction: 'up' | 'down', user_id: string }
 * 
 * Rules:
 * - Can only reorder songs in 'pending' status
 * - User can only reorder their own songs
 * - Changes position atomically using PostgreSQL function
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { queueItemId: string } }
) {
  try {
    const { queueItemId } = params;
    const body = await request.json();
    const { direction, user_id } = body;
    
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
    
    // 2. Verify ownership
    if (queueItem.user_id !== user_id) {
      return NextResponse.json(
        { error: 'You can only reorder your own songs' },
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
    
    // 4. Call PostgreSQL function to reorder atomically
    const { data: success, error: reorderError } = await supabaseAdmin
      .rpc('user_reorder_queue', {
        p_queue_item_id: queueItemId,
        p_user_id: user_id,
        p_direction: direction
      });
    
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
