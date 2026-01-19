import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/server/lib/supabase';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * DELETE /api/queue/item/[queueItemId]?room_id=xxx
 * 
 * Allows users to remove their own songs from the queue.
 * Allows hosts to remove ANY song from the queue (when room_id is provided).
 * Cannot delete songs that are already playing or completed.
 * 
 * Security: 
 * - If room_id query param is provided: Validates user is host of that room
 * - Otherwise: Validates that user_id matches the queue item owner
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { queueItemId: string } }
) {
  try {
    const { queueItemId } = params;
    const { searchParams } = new URL(request.url);
    const roomIdParam = searchParams.get('room_id');
    const userIdParam = searchParams.get('user_id');
    
    // Try to get user_id from query params first, then from body
    let user_id = userIdParam;
    
    if (!user_id) {
      try {
        const body = await request.json();
        user_id = body.user_id;
      } catch (e) {
        // No body or invalid JSON - that's ok if we have user_id in query params
      }
    }
    
    if (!user_id) {
      return NextResponse.json(
        { success: false, error: 'user_id is required (query param or body)' },
        { status: 400 }
      );
    }
    
    console.log('[DELETE queue/item] Request:', { queueItemId, user_id, roomIdParam });
    
    // First, verify the queue item exists
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
    
    // Security: Check if user is authorized to delete this item
    let isAuthorized = false;
    
    // Option 1: User is removing their own song
    if (queueItem.user_id === user_id) {
      isAuthorized = true;
      console.log('[DELETE queue/item] User is removing their own song');
    }
    
    // Option 2: User is the host (if room_id query param is provided)
    if (!isAuthorized && roomIdParam) {
      const { data: room, error: roomError } = await supabaseAdmin
        .from('kara_rooms')
        .select('host_id')
        .eq('id', roomIdParam)
        .single();
      
      if (!roomError && room && room.host_id === user_id) {
        isAuthorized = true;
        console.log('[DELETE queue/item] User is host, allowing deletion of any song');
      }
    }
    
    if (!isAuthorized) {
      console.error('[DELETE queue/item] Unauthorized:', {
        queueItemUserId: queueItem.user_id,
        requestUserId: user_id,
        roomIdParam,
      });
      return NextResponse.json(
        { success: false, error: 'You can only remove your own songs (or any song as host)' },
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
