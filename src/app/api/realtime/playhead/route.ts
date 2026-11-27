import { NextRequest, NextResponse } from 'next/server';
import { getLastPlayhead, publishPlayhead } from '@/server/lib/realtime-hub';

export const dynamic = 'force-dynamic';

/**
 * POST /api/realtime/playhead
 * Primary TV posts playhead ~100ms; hub fans out to SSE subscribers.
 *
 * GET /api/realtime/playhead?roomId=...
 * Secondary poll backup when SSE playhead events are dropped (e.g. proxies).
 */
export async function GET(request: NextRequest) {
  const roomId = request.nextUrl.searchParams.get('roomId');
  if (!roomId) {
    return NextResponse.json({ error: 'roomId required' }, { status: 400 });
  }
  const payload = getLastPlayhead(roomId);
  if (!payload) {
    return NextResponse.json({ ok: true, playhead: null });
  }
  return NextResponse.json({ ok: true, playhead: payload });
}

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
