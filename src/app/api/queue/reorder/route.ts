import { NextRequest, NextResponse } from 'next/server';

// Mark route as dynamic
export const dynamic = 'force-dynamic';
import { QueueManager } from '@/server/lib/queue';
import type { ReorderQueueRequest } from '@/shared/types';

/**
 * Host reorder queue (overrides round-robin)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as ReorderQueueRequest;
    const { queue_item_id, new_position, room_id } = body;

    if (!queue_item_id || new_position === undefined || !room_id) {
      return NextResponse.json(
        { error: 'queue_item_id, new_position, and room_id are required' },
        { status: 400 }
      );
    }

    await QueueManager.hostReorderQueue(room_id, queue_item_id, new_position);

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    console.error('Error reordering queue:', error);
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

