import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/server/lib/supabase';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * DELETE /api/queue/item/[queueItemId]
 * 
 * Allows users to remove their own songs from the queue.
 * Only the song owner can delete their queue item.
 * Cannot delete songs that are already playing or completed.
 * 
 * Security: Validates that user_id matches the queue item owner.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { queueItemId: string } }
) {
  try {
    const { queueItemId } = params;
    
    // Get user_id from request body
    const body = await request.json();
    const { user_id } = body;
    
    if (!user_id) {
      return NextResponse.json(
        { success: false, error: 'user_id is required' },
        { status: 400 }
      );
    }
    
    console.log('[DELETE queue/item] Request:', { queueItemId, user_id });
    
    // First, verify the queue item exists and belongs to the user
    const { data: queueItem, error: fetchError } = await supabaseAdmin
      .from('kara_queue')
      .select('id, user_id, status, room_id')
      .eq('id', queueItemId)
      .single();
    
    if (fetchError || !queueItem) {
      console.error('[DELETE queue/item] Queue item not found:', fetchError);
      return NextResponse.json(
        { success: false, error: 'Queue item not found' },
        { status: 404 }
      );
    }
    
    // Security: Verify user owns this queue item
    if (queueItem.user_id !== user_id) {
      console.error('[DELETE queue/item] Unauthorized:', {
        queueItemUserId: queueItem.user_id,
        requestUserId: user_id,
      });
      return NextResponse.json(
        { success: false, error: 'You can only remove your own songs' },
        { status: 403 }
      );
    }
    
    // Cannot delete songs that are currently playing
    if (queueItem.status === 'playing') {
      console.error('[DELETE queue/item] Cannot delete playing song');
      return NextResponse.json(
        { success: false, error: 'Cannot remove currently playing song' },
        { status: 400 }
      );
    }
    
    // Cannot delete completed songs (they're already done)
    if (queueItem.status === 'completed') {
      console.error('[DELETE queue/item] Cannot delete completed song');
      return NextResponse.json(
        { success: false, error: 'Cannot remove completed songs' },
        { status: 400 }
      );
    }
    
    // Delete the queue item
    const { error: deleteError } = await supabaseAdmin
      .from('kara_queue')
      .delete()
      .eq('id', queueItemId);
    
    if (deleteError) {
      console.error('[DELETE queue/item] Delete failed:', deleteError);
      return NextResponse.json(
        { success: false, error: 'Failed to remove song from queue' },
        { status: 500 }
      );
    }
    
    console.log('[DELETE queue/item] Success:', { queueItemId, room_id: queueItem.room_id });
    
    return NextResponse.json(
      { 
        success: true, 
        message: 'Song removed from queue',
        room_id: queueItem.room_id 
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
      }
    );
  } catch (error: unknown) {
    console.error('[DELETE queue/item] Unexpected error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
