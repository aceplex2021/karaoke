/**
 * API: Re-Approve User
 * POST /api/rooms/[roomId]/reapprove-user
 * 
 * Host re-approves a denied or expired user
 * v4.4: Already using supabaseAdmin
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/server/lib/supabase';

// v4.4.1: Disable Next.js caching - CRITICAL for real-time approval
export const dynamic = 'force-dynamic';
export const revalidate = 0;

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
    const { data: room } = await supabaseAdmin
      .from('kara_rooms')
      .select('host_id')
      .eq('id', roomId)
      .single();

    if (!room || room.host_id !== host_id) {
      return NextResponse.json(
        { error: 'Only host can re-approve users' },
        { status: 403 }
      );
    }

    // Re-approve user
    const { data, error } = await supabaseAdmin
      .from('kara_room_participants')
      .update({
        status: 'approved',
        approved_at: new Date().toISOString(),
        expires_at: null,
      })
      .eq('room_id', roomId)
      .eq('user_id', user_id)
      .select()
      .single();

    if (error) {
      console.error('[API] Error re-approving user:', error);
      return NextResponse.json(
        { error: 'Failed to re-approve user' },
        { status: 500 }
      );
    }

    console.log('[API] User re-approved:', user_id);

    return NextResponse.json({
      success: true,
      participant: data,
    });

  } catch (error: any) {
    console.error('[API] Error in reapprove-user:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
