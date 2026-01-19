import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/server/lib/supabase';

/**
 * Get user's song history for a room (updated for new schema)
 * Note: kara_song_history now references version_id instead of song_id
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
        kara_versions (
          id,
          title_display,
          tone,
          mixer,
          style,
          artist_name,
          performance_type
        )
      `)
      .eq('room_id', roomId)
      .eq('user_id', userId)
      .order('sung_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch history: ${error.message}`);
    }
    
    // Map kara_versions to version for consistency
    if (history) {
      for (const item of history) {
        (item as any).version = (item as any).kara_versions;
        delete (item as any).kara_versions;
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

