/**
 * API: Get User's Approval Status in Room
 * GET /api/rooms/[roomId]/user-status?userId={userId}
 * 
 * Returns the user's participant status in the room
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  try {
    const { roomId } = await params;
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json(
        { error: 'userId query parameter is required' },
        { status: 400 }
      );
    }

    // Get participant status
    const { data: participant, error } = await supabase
      .from('kara_room_participants')
      .select('id, status, role, expires_at, approved_at, joined_at')
      .eq('room_id', roomId)
      .eq('user_id', userId)
      .single();

    if (error) {
      // User not a participant yet
      return NextResponse.json({
        status: 'not_joined',
        participant: null,
      });
    }

    // Check if pending approval has expired
    if (participant.status === 'pending' && participant.expires_at) {
      const expiresAt = new Date(participant.expires_at);
      if (expiresAt < new Date()) {
        // Auto-deny expired request
        await supabase
          .from('kara_room_participants')
          .update({ status: 'denied' })
          .eq('id', participant.id);

        return NextResponse.json({
          status: 'denied',
          reason: 'Approval request expired',
          participant: { ...participant, status: 'denied' },
        });
      }
    }

    return NextResponse.json({
      status: participant.status,
      participant,
    });

  } catch (error: any) {
    console.error('[API] Error in user-status:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
