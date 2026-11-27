/**
 * API: Register TV for Primary/Secondary Mode
 * POST /api/rooms/[roomId]/register-tv
 *
 * Atomic primary claim: UPDATE ... WHERE primary_tv_id IS NULL
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/server/lib/supabase';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: { roomId: string } }
) {
  try {
    const roomId = params.roomId;
    const body = await request.json();
    const { tv_id } = body;

    if (!tv_id) {
      return NextResponse.json({ error: 'Missing tv_id' }, { status: 400 });
    }

    console.log('[API] Registering TV:', tv_id, 'for room:', roomId);

    const { data: room, error: roomError } = await supabaseAdmin
      .from('kara_rooms')
      .select('id, primary_tv_id, connected_tv_ids')
      .eq('id', roomId)
      .single();

    if (roomError || !room) {
      return NextResponse.json({ error: 'Room not found' }, { status: 404 });
    }

    const { error: addTvError } = await supabaseAdmin.rpc('add_connected_tv', {
      p_room_id: roomId,
      p_tv_id: tv_id,
    });
    if (addTvError) {
      console.warn('[API] Failed to add TV to connected list:', addTvError);
    }

    let isPrimary = false;

    if (room.primary_tv_id === tv_id) {
      isPrimary = true;
      console.log('[API] TV', tv_id, 'is already PRIMARY');
    } else if (!room.primary_tv_id) {
      // Atomic claim — only wins if still null
      const { data: claimed, error: claimError } = await supabaseAdmin
        .from('kara_rooms')
        .update({ primary_tv_id: tv_id })
        .eq('id', roomId)
        .is('primary_tv_id', null)
        .select('primary_tv_id')
        .maybeSingle();

      if (claimError) {
        console.error('[API] Failed to claim primary TV:', claimError);
        return NextResponse.json(
          { error: 'Failed to register as primary TV' },
          { status: 500 }
        );
      }

      if (claimed?.primary_tv_id === tv_id) {
        isPrimary = true;
        console.log('[API] TV', tv_id, 'registered as PRIMARY (atomic)');
      } else {
        // Lost race — re-read winner
        const { data: refreshed } = await supabaseAdmin
          .from('kara_rooms')
          .select('primary_tv_id')
          .eq('id', roomId)
          .single();
        isPrimary = refreshed?.primary_tv_id === tv_id;
        console.log(
          '[API] TV',
          tv_id,
          isPrimary ? 'is PRIMARY after race' : 'registered as SECONDARY (lost primary race)'
        );
      }
    } else {
      isPrimary = false;
      console.log('[API] TV', tv_id, 'registered as SECONDARY');
    }

    return NextResponse.json({
      success: true,
      is_primary: isPrimary,
      tv_id,
    });
  } catch (error: any) {
    console.error('[API] Error in register-tv:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
