import { NextRequest, NextResponse } from 'next/server';
import { getLastPlayhead, publishPlayhead } from '@/server/lib/realtime-hub';
import { query, useLocalPg } from '@/server/lib/db';
import { supabaseAdmin } from '@/server/lib/supabase';

export const dynamic = 'force-dynamic';

type PlayheadPayload = {
  entryId?: string;
  t: number;
  paused: boolean;
  wallMs: number;
};

async function persistPlayhead(roomId: string, payload: PlayheadPayload) {
  try {
    if (useLocalPg) {
      await query(`UPDATE kara_rooms SET tv_playhead = $2::jsonb WHERE id = $1::uuid`, [
        roomId,
        JSON.stringify(payload),
      ]);
      return;
    }
    await supabaseAdmin
      .from('kara_rooms')
      .update({ tv_playhead: payload })
      .eq('id', roomId);
  } catch (err) {
    console.warn('[playhead] persist failed', err);
  }
}

async function loadPlayheadFromDb(roomId: string): Promise<PlayheadPayload | null> {
  try {
    if (useLocalPg) {
      const { rows } = await query<{ tv_playhead: PlayheadPayload | null }>(
        `SELECT tv_playhead FROM kara_rooms WHERE id = $1::uuid`,
        [roomId]
      );
      const p = rows[0]?.tv_playhead;
      if (!p || typeof p.t !== 'number') return null;
      return p;
    }
    const { data } = await supabaseAdmin
      .from('kara_rooms')
      .select('tv_playhead')
      .eq('id', roomId)
      .maybeSingle();
    const p = data?.tv_playhead as PlayheadPayload | null;
    if (!p || typeof p.t !== 'number') return null;
    return p;
  } catch (err) {
    console.warn('[playhead] load failed', err);
    return null;
  }
}

/**
 * GET /api/realtime/playhead?roomId=...
 * Memory first, then DB (shared across workers).
 */
export async function GET(request: NextRequest) {
  const roomId = request.nextUrl.searchParams.get('roomId');
  if (!roomId) {
    return NextResponse.json({ error: 'roomId required' }, { status: 400 });
  }

  let payload = getLastPlayhead(roomId) as PlayheadPayload | null;
  if (!payload) {
    payload = await loadPlayheadFromDb(roomId);
    if (payload) {
      publishPlayhead(roomId, payload as unknown as Record<string, unknown>);
    }
  }

  return NextResponse.json({ ok: true, playhead: payload });
}

/**
 * POST /api/realtime/playhead
 * Primary TV posts playhead; memory + SSE + DB persist.
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

    const payload: PlayheadPayload = {
      entryId: body.entryId || body.entry_id,
      t: body.t,
      paused: Boolean(body.paused),
      wallMs: typeof body.wallMs === 'number' ? body.wallMs : Date.now(),
    };

    publishPlayhead(String(roomId), payload as unknown as Record<string, unknown>);
    // Fire-and-forget DB write so secondaries on other workers can poll
    void persistPlayhead(String(roomId), payload);

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Bad request' },
      { status: 400 }
    );
  }
}
