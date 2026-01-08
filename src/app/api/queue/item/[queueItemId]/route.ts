import { NextRequest, NextResponse } from 'next/server';
import { QueueManager } from '@/server/lib/queue';

/**
 * Remove song from queue (host only)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { queueItemId: string } }
) {
  try {
    const { queueItemId } = params;
    const searchParams = request.nextUrl.searchParams;
    const room_id = searchParams.get('room_id');

    if (!room_id) {
      return NextResponse.json(
        { error: 'room_id is required' },
        { status: 400 }
      );
    }

    await QueueManager.removeFromQueue(queueItemId, room_id);

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    console.error('Error removing from queue:', error);
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

