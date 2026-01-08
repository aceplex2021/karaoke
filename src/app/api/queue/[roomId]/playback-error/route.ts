import { NextRequest, NextResponse } from 'next/server';
import { QueueManager } from '@/server/lib/queue';

/**
 * TV reports playback error (backend authority)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { roomId: string } }
) {
  try {
    const { roomId } = params;
    const body = await request.json() as { queueItemId: string };
    const { queueItemId } = body;

    if (!queueItemId) {
      return NextResponse.json(
        { error: 'queueItemId is required' },
        { status: 400 }
      );
    }

    await QueueManager.handlePlaybackError(roomId, queueItemId);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    console.error('Error handling playback error:', error);
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

