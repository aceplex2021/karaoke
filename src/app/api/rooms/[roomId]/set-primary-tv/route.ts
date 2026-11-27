import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/server/lib/supabase';
import { notifyRoom } from '@/server/lib/db';

export const dynamic = 'force-dynamic';

/**
 * POST /api/rooms/[roomId]/set-primary-tv
 * Replaces browser supabase.rpc('set_primary_tv').
 * Body: { user_id, tv_id }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { roomId: string } }
) {
  try {
    const roomId = params.roomId;
    const body = await request.json();
    const { user_id, tv_id } = body;

    if (!user_id || !tv_id) {
      return NextResponse.json(
        { error: 'user_id and tv_id required' },
        { status: 400 }
      );
    }

    const { data: room, error: roomError } = await supabaseAdmin
      .from('kara_rooms')
      .select('id, host_id')
      .eq('id', roomId)
      .single();

    if (roomError || !room) {
      return NextResponse.json({ error: 'Room not found' }, { status: 404 });
    }

    if (room.host_id !== user_id) {
      // Still try RPC if present (SECURITY DEFINER host check); else enforce here
      return NextResponse.json({ error: 'Only host can set primary TV' }, { status: 403 });
    }

    const { error: rpcError } = await supabaseAdmin.rpc('set_primary_tv', {
      p_room_id: roomId,
      p_user_id: user_id,
      p_tv_id: tv_id,
    });

    if (rpcError) {
      // Fallback: direct update when function missing on fresh local DB
      const { error: updErr } = await supabaseAdmin
        .from('kara_rooms')
        .update({ primary_tv_id: tv_id })
        .eq('id', roomId);
      if (updErr) {
        return NextResponse.json({ error: updErr.message || rpcError.message }, { status: 500 });
      }
    }

    await notifyRoom(roomId, 'primary_tv');
    return NextResponse.json({ success: true, primary_tv_id: tv_id });
  } catch (err: any) {
    console.error('[set-primary-tv]', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
