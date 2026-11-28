import { NextRequest, NextResponse } from 'next/server';
import {
  clearPlayhead,
  getLastPlayhead,
  publishPlayhead,
} from '@/server/lib/realtime-hub';
import { query, useLocalPg } from '@/server/lib/db';
import { supabaseAdmin } from '@/server/lib/supabase';

export const dynamic = 'force-dynamic';

type PlayheadPayload = {
  entryId?: string;
  t: number;
  paused: boolean;
  wallMs: number;
};

let columnEnsured = false;

/** Idempotent: secondaries stuck on Syncing if this column was never migrated. */
async function ensureTvPlayheadColumn() {
  if (columnEnsured || !useLocalPg) return;
  try {
    await query(
      `ALTER TABLE kara_rooms ADD COLUMN IF NOT EXISTS tv_playhead JSONB`
    );
    columnEnsured = true;
  } catch (err) {
    console.warn('[playhead] ensure column failed', err);
  }
}

async function persistPlayhead(roomId: string, payload: PlayheadPayload) {
  await ensureTvPlayheadColumn();
  try {
    if (useLocalPg) {
      await query(`UPDATE kara_rooms SET tv_playhead = $2::jsonb WHERE id = $1::uuid`, [
        roomId,
        JSON.stringify(payload),
      ]);
      return;
    }
    const { error } = await supabaseAdmin
      .from('kara_rooms')
      .update({ tv_playhead: payload })
      .eq('id', roomId);
    if (error) console.warn('[playhead] persist failed', error.message);
  } catch (err) {
    console.warn('[playhead] persist failed', err);
  }
}

async function clearPlayheadDb(roomId: string) {
  await ensureTvPlayheadColumn();
  try {
    if (useLocalPg) {
      await query(`UPDATE kara_rooms SET tv_playhead = NULL WHERE id = $1::uuid`, [roomId]);
      return;
    }
    await supabaseAdmin.from('kara_rooms').update({ tv_playhead: null }).eq('id', roomId);
  } catch (err) {
    console.warn('[playhead] clear failed', err);
  }
}

async function loadPlayheadFromDb(roomId: string): Promise<PlayheadPayload | null> {
  await ensureTvPlayheadColumn();
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
    const { data, error } = await supabaseAdmin
      .from('kara_rooms')
      .select('tv_playhead')
      .eq('id', roomId)
      .maybeSingle();
    if (error) {
      console.warn('[playhead] load failed', error.message);
      return null;
    }
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
  // Prefer DB when memory packet is missing OR older than DB (multi-worker)
  const fromDb = await loadPlayheadFromDb(roomId);
  if (fromDb) {
    if (
      !payload ||
      (typeof fromDb.wallMs === 'number' &&
        typeof payload.wallMs === 'number' &&
        fromDb.wallMs > payload.wallMs)
    ) {
      payload = fromDb;
      publishPlayhead(roomId, payload as unknown as Record<string, unknown>);
    }
  }

  return NextResponse.json({ ok: true, playhead: payload });
}

/**
 * POST /api/realtime/playhead
 * Primary TV posts playhead; memory + SSE + DB persist (awaited for cross-worker polls).
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
    // Await so secondary on another worker sees playhead on next poll (fixes stuck Syncing)
    await persistPlayhead(String(roomId), payload);

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Bad request' },
      { status: 400 }
    );
  }
}

/** DELETE — clear playhead (song advance). Optional helper used by advance route via hub+DB. */
export async function DELETE(request: NextRequest) {
  const roomId = request.nextUrl.searchParams.get('roomId');
  if (!roomId) {
    return NextResponse.json({ error: 'roomId required' }, { status: 400 });
  }
  clearPlayhead(roomId);
  await clearPlayheadDb(roomId);
  return NextResponse.json({ ok: true });
}
