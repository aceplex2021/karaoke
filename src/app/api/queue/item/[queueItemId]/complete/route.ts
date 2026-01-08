import { NextRequest, NextResponse } from 'next/server';
import { QueueManager } from '@/server/lib/queue';

/**
 * Mark song as completed (legacy endpoint - uses handlePlaybackEnded)
 * Note: In Phase B, playback is backend-controlled via handlePlaybackEnded
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { queueItemId: string } }
) {
  try {
    const { queueItemId } = params;
    const body = await request.json() as { room_id: string; user_id: string; song_id: string };
    const { room_id } = body;

    if (!room_id) {
      return NextResponse.json(
        { error: 'room_id is required' },
        { status: 400 }
      );
    }

    // Use handlePlaybackEnded which handles the completion atomically
    await QueueManager.handlePlaybackEnded(room_id, queueItemId);

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    console.error('Error marking as completed:', error);
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

