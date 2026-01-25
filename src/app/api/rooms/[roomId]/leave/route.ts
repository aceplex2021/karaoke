import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/server/lib/supabase';

// Mark route as dynamic
export const dynamic = 'force-dynamic';

/**
 * POST /api/rooms/[roomId]/leave
 * Remove user from room (leave room)
 * 
 * Phase 2: Fix stuck in room issue
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  try {
    const { roomId } = await params;
    const body = await request.json();
    const { user_id } = body;

    if (!user_id) {
      return NextResponse.json(
        { error: 'user_id is required' },
        { status: 400 }
      );
    }

    // Verify user is a participant in this room
    const { data: participant, error: participantError } = await supabaseAdmin
      .from('kara_room_participants')
      .select('*')
      .eq('room_id', roomId)
      .eq('user_id', user_id)
      .single();

    if (participantError || !participant) {
      return NextResponse.json(
        { error: 'User is not a participant in this room' },
        { status: 404 }
      );
    }

    // Remove user from room
    const { error: deleteError } = await supabaseAdmin
      .from('kara_room_participants')
      .delete()
      .eq('room_id', roomId)
      .eq('user_id', user_id);

    if (deleteError) {
      console.error('[API /leave] Error removing participant:', deleteError);
      return NextResponse.json(
        { error: 'Failed to leave room' },
        { status: 500 }
      );
    }

    console.log('[API /leave] User left room:', { roomId, userId: user_id });

    return NextResponse.json({
      success: true,
      message: 'Left room successfully',
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    console.error('[API /leave] Unexpected error:', error);
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
