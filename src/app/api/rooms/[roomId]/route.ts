import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/server/lib/supabase';
import type { Room } from '@/shared/types';

/**
 * Get or load room (TV mode - persistent room)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  try {
    const { roomId } = await params;

    const { data: room, error } = await supabaseAdmin
      .from('kara_rooms')
      .select('*')
      .eq('id', roomId)
      .eq('is_active', true)
      .single();

    if (error || !room) {
      return NextResponse.json(
        { error: 'Room not found' },
        { status: 404 }
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

