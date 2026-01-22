/**
 * API: Approve User
 * POST /api/rooms/[roomId]/approve-user
 * 
 * Host approves a pending user
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  try {
    const { roomId } = await params;
    const body = await request.json();
    const { user_id, host_id } = body;

    if (!user_id || !host_id) {
      return NextResponse.json(
        { error: 'user_id and host_id are required' },
        { status: 400 }
      );
    }

    // Verify host
    const { data: room } = await supabase
      .from('kara_rooms')
      .select('host_id')
      .eq('id', roomId)
      .single();

    if (!room || room.host_id !== host_id) {
      return NextResponse.json(
        { error: 'Only host can approve users' },
        { status: 403 }
      );
    }

    // Approve user
    const { data, error } = await supabase
      .from('kara_room_participants')
      .update({
        status: 'approved',
        approved_at: new Date().toISOString(),
        expires_at: null, // Clear expiry
      })
      .eq('room_id', roomId)
      .eq('user_id', user_id)
      .select()
      .single();

    if (error) {
      console.error('[API] Error approving user:', error);
      return NextResponse.json(
        { error: 'Failed to approve user' },
        { status: 500 }
      );
    }

    console.log('[API] User approved:', user_id);

    return NextResponse.json({
      success: true,
      participant: data,
    });

  } catch (error: any) {
    console.error('[API] Error in approve-user:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
