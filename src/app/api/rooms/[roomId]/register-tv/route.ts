/**
 * API: Register TV for Primary/Secondary Mode
 * POST /api/rooms/[roomId]/register-tv
 * 
 * Registers a TV as primary (if none exists) or secondary
 * Returns whether this TV is primary or secondary
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

export async function POST(
  request: NextRequest,
  { params }: { params: { roomId: string } }
) {
  try {
    const roomId = params.roomId;
    const body = await request.json();
    const { tv_id } = body;

    if (!tv_id) {
      return NextResponse.json(
        { error: 'Missing tv_id' },
        { status: 400 }
      );
    }

    console.log('[API] Registering TV:', tv_id, 'for room:', roomId);

    // Get current room state
    const { data: room, error: roomError } = await supabaseAdmin
      .from('kara_rooms')
      .select('id, primary_tv_id, connected_tv_ids')
      .eq('id', roomId)
      .single();

    if (roomError || !room) {
      return NextResponse.json(
        { error: 'Room not found' },
        { status: 404 }
      );
    }

    // v5.0: Add TV to connected list (via database function)
    const { error: addTvError } = await supabaseAdmin.rpc('add_connected_tv', {
      p_room_id: roomId,
      p_tv_id: tv_id
    });

    if (addTvError) {
      console.warn('[API] Failed to add TV to connected list:', addTvError);
      // Continue anyway - not critical
    } else {
      console.log('[API] TV added to connected list:', tv_id);
    }

    let isPrimary = false;

    // If no primary TV exists, set this TV as primary
    if (!room.primary_tv_id) {
      const { error: updateError } = await supabaseAdmin
        .from('kara_rooms')
        .update({ primary_tv_id: tv_id })
        .eq('id', roomId);

      if (updateError) {
        console.error('[API] Failed to set primary TV:', updateError);
        return NextResponse.json(
          { error: 'Failed to register as primary TV' },
          { status: 500 }
        );
      }

      isPrimary = true;
      console.log('[API] TV', tv_id, 'registered as PRIMARY');
    } else if (room.primary_tv_id === tv_id) {
      // This TV is already the primary
      isPrimary = true;
      console.log('[API] TV', tv_id, 'is already PRIMARY');
    } else {
      // Another TV is primary, this is secondary
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
