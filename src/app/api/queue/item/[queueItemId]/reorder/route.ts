import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/server/lib/supabase';
import { nudgeQueueItem } from '@/server/lib/queue-order';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/queue/item/[queueItemId]/reorder
 *
 * Reorder via sort_key swap with visual neighbor (single source of truth).
 * Host: adjacent in full pending queue. User: adjacent among own songs.
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

    const { data: queueItem, error: fetchError } = await supabaseAdmin
      .from('kara_queue')
      .select('id, user_id, room_id, status')
      .eq('id', queueItemId)
      .single();

    if (fetchError || !queueItem) {
      return NextResponse.json({ error: 'Queue item not found' }, { status: 404 });
    }

    if (queueItem.status !== 'pending') {
      return NextResponse.json(
        { error: 'Can only reorder pending songs' },
        { status: 400 }
      );
    }

    const roomId = room_id || queueItem.room_id;
    let isHost = false;
    if (roomId) {
      const { data: room } = await supabaseAdmin
        .from('kara_rooms')
        .select('host_id')
        .eq('id', roomId)
        .single();
      isHost = !!(room && room.host_id === user_id);
    }

    const ownsSong = queueItem.user_id === user_id;
    if (!ownsSong && !isHost) {
      return NextResponse.json(
        { error: 'You can only reorder your own songs (or any song as host)' },
        { status: 403 }
      );
    }

    // Host uses full-queue adjacency even when moving their own song
    const scope = isHost ? 'host' : 'user';
    const result = await nudgeQueueItem({
      queueItemId,
      roomId: queueItem.room_id,
      direction,
      scope,
      userId: user_id,
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error || 'Cannot reorder' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Song moved ${direction}`,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    console.error('[queue/reorder] Error:', error);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
