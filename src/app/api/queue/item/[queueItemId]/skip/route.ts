import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/server/lib/supabase';
import { QueueManager } from '@/server/lib/queue';

/**
 * Skip song (backend-controlled)
 * Marks song as skipped and auto-starts next song
 * Idempotent: returns 200 if already skipped/ended/error
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { queueItemId: string } }
) {
  try {
    const { queueItemId } = params;

    if (!queueItemId) {
      return NextResponse.json(
        { error: 'queueItemId is required' },
        { status: 400 }
      );
    }

    // Get queue item to check status and get room_id
    const { data: queueItem, error: fetchError } = await supabaseAdmin
      .from('kara_queue')
      .select('id, status, room_id')
      .eq('id', queueItemId)
      .single();

    if (fetchError || !queueItem) {
      return NextResponse.json(
        { error: 'Queue item not found' },
        { status: 404 }
      );
    }

    // Idempotency: if already skipped/ended/error, return 200 and ensure playing
    if (queueItem.status === 'skipped' || queueItem.status === 'completed' || queueItem.status === 'error') {
      // Already in terminal state, ensure playback continues if room is idle
      await QueueManager.ensurePlaying(queueItem.room_id);
      return NextResponse.json({ success: true, message: 'Already skipped' });
    }

    // Skip the song (handles both playing and pending items)
    await QueueManager.skipSong(queueItem.room_id, queueItemId);

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    console.error('Error skipping song:', error);
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

