/**
 * API: Remove User from Room
 * POST /api/rooms/[roomId]/remove-user
 * 
 * Host removes a participant (deletes their record)
 * Allows user to rejoin with fresh request
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

    console.log('[API /remove-user] 🗑️ Request to remove user:', { roomId, user_id, host_id });

    if (!user_id || !host_id) {
      console.error('[API /remove-user] ❌ Missing required fields');
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
      console.error('[API /remove-user] ❌ Unauthorized: not host');
      return NextResponse.json(
        { error: 'Only host can remove users' },
        { status: 403 }
      );
    }

    // Prevent host from removing themselves
    if (room.host_id === user_id) {
      console.error('[API /remove-user] ❌ Cannot remove self');
      return NextResponse.json(
        { error: 'Host cannot remove themselves' },
        { status: 400 }
      );
    }

    // Remove participant record
    console.log('[API /remove-user] 🔪 Executing DELETE from kara_room_participants');
    const { data: deletedData, error } = await supabaseAdmin
      .from('kara_room_participants')
      .delete()
      .eq('room_id', roomId)
      .eq('user_id', user_id)
      .select(); // Add select to see what was deleted

    if (error) {
      console.error('[API /remove-user] ❌ Error removing user:', error);
      return NextResponse.json(
        { error: 'Failed to remove user' },
        { status: 500 }
      );
    }

    console.log('[API /remove-user] ✅ User removed successfully:', {
      user_id,
      deletedRecords: deletedData?.length || 0,
      deletedData
    });

    return NextResponse.json({
      success: true,
      message: 'User removed successfully',
    });

  } catch (error: any) {
    console.error('[API] Error in remove-user:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
