import { NextRequest, NextResponse } from 'next/server';
import { publishPlayhead } from '@/server/lib/realtime-hub';

export const dynamic = 'force-dynamic';

/**
 * POST /api/realtime/playhead
 * Primary TV posts playhead ~100ms; hub fans out to SSE subscribers.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const roomId = body.roomId || body.room_id;
    if (!roomId || typeof body.t !== 'number') {
      return NextResponse.json(
        { error: 'roomId and t (seconds) required' },
        { status: 400 }
      );
    }

    publishPlayhead(String(roomId), {
      entryId: body.entryId || body.entry_id,
      t: body.t,
      paused: Boolean(body.paused),
      wallMs: typeof body.wallMs === 'number' ? body.wallMs : Date.now(),
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Bad request' },
      { status: 400 }
    );
  }
}
