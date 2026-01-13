import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/server/lib/supabase';

/**
 * Get user's song history for a room
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { roomId: string; userId: string } }
) {
  try {
    const { roomId, userId } = params;

    const { data: history, error } = await supabaseAdmin
      .from('kara_song_history')
      .select(`
        *,
        kara_songs(*)
      `)
      .eq('room_id', roomId)
      .eq('user_id', userId)
      .order('sung_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch history: ${error.message}`);
    }
    
    // Map kara_songs to song for backward compatibility
    if (history) {
      for (const item of history) {
        (item as any).song = (item as any).kara_songs;
      }
    }

    return NextResponse.json({ history: history || [] });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    console.error('Error fetching history:', error);
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

