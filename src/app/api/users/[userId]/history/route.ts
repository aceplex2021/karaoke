import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/server/lib/supabase';

export const dynamic = 'force-dynamic';

/**
 * GET /api/users/[userId]/history?room_id=xxx
 * Get user's song history (optionally filtered by room)
 * Returns last 12 months by default
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    const { userId } = params;
    const { searchParams } = new URL(request.url);
    const roomId = searchParams.get('room_id');
    
    // Calculate 12 months ago
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
    
    let query = supabaseAdmin
      .from('kara_song_history')
      .select(`
        *,
        kara_songs(*)
      `)
      .eq('user_id', userId)
      .gte('sung_at', twelveMonthsAgo.toISOString())
      .order('sung_at', { ascending: false });
    
    if (roomId) {
      query = query.eq('room_id', roomId);
    }
    
    const { data: history, error } = await query;
    
    if (error) {
      throw error;
    }
    
    // Map kara_songs to song for backward compatibility
    const mapped = (history || []).map(item => ({
      ...item,
      song: (item as any).kara_songs,
    }));
    
    return NextResponse.json({ history: mapped });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    console.error('[users/history] Error:', error);
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
