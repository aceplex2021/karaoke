import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/server/lib/supabase';
import type { Room } from '@/shared/types';

/**
 * Get room by code
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params;

    const { data: room, error } = await supabaseAdmin
      .from('kara_rooms')
      .select('*')
      .eq('room_code', code.toUpperCase())
      .eq('is_active', true)
      .single();

    if (error || !room) {
      return NextResponse.json(
        { error: 'Room not found' },
        { status: 404 }
      );
    }

    // Phase 1: Check if room has expired
    if (room.expires_at && new Date(room.expires_at) < new Date()) {
      // Room has expired, mark as inactive
      await supabaseAdmin
        .from('kara_rooms')
        .update({ is_active: false })
        .eq('id', room.id);
      
      return NextResponse.json(
        { error: 'Room has expired' },
        { status: 410 } // 410 Gone
      );
    }

    return NextResponse.json({ room: room as Room });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    console.error('Error fetching room:', error);
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

