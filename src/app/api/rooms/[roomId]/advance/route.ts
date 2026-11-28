import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/server/lib/supabase';
import { clearPlayhead, publishPlayhead } from '@/server/lib/realtime-hub';
import { query, useLocalPg } from '@/server/lib/db';

export const dynamic = 'force-dynamic';

/** Clear or seed playhead so secondaries leave Syncing on song change without waiting on Samsung POSTs. */
async function writeRoomPlayhead(
  roomId: string,
  payload: { entryId: string; t: number; paused: boolean; wallMs: number } | null
) {
  if (!payload) {
    clearPlayhead(roomId);
  } else {
    publishPlayhead(roomId, payload as unknown as Record<string, unknown>);
  }
  try {
    if (useLocalPg) {
      await query(`UPDATE kara_rooms SET tv_playhead = $2::jsonb WHERE id = $1::uuid`, [
        roomId,
        payload ? JSON.stringify(payload) : null,
      ]);
    } else {
      await supabaseAdmin
        .from('kara_rooms')
        .update({ tv_playhead: payload })
        .eq('id', roomId);
    }
  } catch (err) {
    console.warn('[advance] write playhead failed', err);
  }
}

async function seedPlayheadForCurrentEntry(roomId: string) {
  const { data: room } = await supabaseAdmin
    .from('kara_rooms')
    .select('current_entry_id')
    .eq('id', roomId)
    .maybeSingle();
  const entryId = room?.current_entry_id;
  if (!entryId) {
    await writeRoomPlayhead(roomId, null);
    return;
  }
  await writeRoomPlayhead(roomId, {
    entryId,
    t: 0,
    paused: false,
    wallMs: Date.now(),
  });
}

/**
 * POST /api/rooms/[roomId]/advance
 *
 * Advance playback using sort_key order.
 * Authority: primary TV (tv_id) or room host (user_id). Prevents dual-TV races.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  try {
    const { roomId } = await params;
    const body = await request.json().catch(() => ({} as Record<string, unknown>));
    const tvId = typeof body.tv_id === 'string' ? body.tv_id : null;
    const userId = typeof body.user_id === 'string' ? body.user_id : null;

    console.log('[advance] Called for room:', roomId, { tvId: tvId?.slice(0, 8), userId: userId?.slice(0, 8) });

    const { data: room, error: roomError } = await supabaseAdmin
      .from('kara_rooms')
      .select('id, host_id, primary_tv_id, current_entry_id')
      .eq('id', roomId)
      .single();

    if (roomError || !room) {
      return NextResponse.json({ error: 'Room not found' }, { status: 404 });
    }

    // Enforce single advancer when a primary TV is registered
    if (room.primary_tv_id) {
      const isPrimaryTv = !!(tvId && tvId === room.primary_tv_id);
      const isHost = !!(userId && room.host_id && userId === room.host_id);
      if (!isPrimaryTv && !isHost) {
        console.log('[advance] Rejected — not primary TV or host');
        return NextResponse.json(
          { error: 'Only primary TV or host may advance playback' },
          { status: 403 }
        );
      }
    }

    // Prefer RPC when available (advisory lock + history); fall back to inline sort_key advance
    const { data: rpcData, error: rpcError } = await supabaseAdmin.rpc('advance_playback', {
      p_room_id: roomId,
    });

    if (!rpcError) {
      let advanced = false;
      if (typeof rpcData === 'boolean') {
        advanced = rpcData;
      } else if (Array.isArray(rpcData) && rpcData[0]) {
        advanced = rpcData[0].advanced === true;
      } else if (rpcData && typeof rpcData === 'object') {
        advanced = (rpcData as { advanced?: boolean }).advanced === true;
      }

      // Stamp start + seed playhead at t=0 (Samsung may throttle setInterval mid-song)
      if (advanced) {
        await supabaseAdmin
          .from('kara_rooms')
          .update({ current_song_started_at: new Date().toISOString() })
          .eq('id', roomId);
        await seedPlayheadForCurrentEntry(roomId);
      }

      return NextResponse.json({
        success: true,
        advanced,
        message: advanced ? undefined : 'Queue empty',
      });
    }

    console.warn('[advance] RPC unavailable, using inline sort_key advance:', rpcError.message);
    return await inlineAdvance(roomId, room.current_entry_id);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    console.error('[advance] Error:', error);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

async function inlineAdvance(roomId: string, currentEntryId: string | null) {
  // Complete current
  if (currentEntryId) {
    const { data: current } = await supabaseAdmin
      .from('kara_queue')
      .select('id, user_id, version_id')
      .eq('id', currentEntryId)
      .maybeSingle();

    await supabaseAdmin
      .from('kara_queue')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', currentEntryId);

    if (current?.version_id && current?.user_id) {
      const { data: hist } = await supabaseAdmin
        .from('kara_song_history')
        .select('id, times_sung')
        .eq('user_id', current.user_id)
        .eq('version_id', current.version_id)
        .maybeSingle();

      if (hist) {
        await supabaseAdmin
          .from('kara_song_history')
          .update({
            times_sung: (hist.times_sung || 0) + 1,
            sung_at: new Date().toISOString(),
            room_id: roomId,
            updated_at: new Date().toISOString(),
          })
          .eq('id', hist.id);
      } else {
        await supabaseAdmin.from('kara_song_history').insert({
          room_id: roomId,
          user_id: current.user_id,
          version_id: current.version_id,
          sung_at: new Date().toISOString(),
          times_sung: 1,
        });
      }
    }
  }

  const { data: next } = await supabaseAdmin
    .from('kara_queue')
    .select('id')
    .eq('room_id', roomId)
    .eq('status', 'pending')
    .order('sort_key', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!next) {
    await writeRoomPlayhead(roomId, null);
    await supabaseAdmin
      .from('kara_rooms')
      .update({
        current_entry_id: null,
        current_song_started_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', roomId);

    return NextResponse.json({
      success: true,
      advanced: false,
      message: 'Queue empty',
    });
  }

  await supabaseAdmin
    .from('kara_queue')
    .update({ status: 'playing', started_at: new Date().toISOString() })
    .eq('id', next.id);

  await supabaseAdmin
    .from('kara_rooms')
    .update({
      current_entry_id: next.id,
      current_song_started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', roomId);

  await writeRoomPlayhead(roomId, {
    entryId: next.id,
    t: 0,
    paused: false,
    wallMs: Date.now(),
  });

  console.log('[advance] Inline advanced to', next.id);
  return NextResponse.json({ success: true, advanced: true });
}
