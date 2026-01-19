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
    
    console.log('[users/history] Fetching history for user:', userId, 'room:', roomId || 'all', 'since:', twelveMonthsAgo.toISOString());
    
    let query = supabaseAdmin
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
      .eq('user_id', userId)
      .gte('sung_at', twelveMonthsAgo.toISOString())
      .order('sung_at', { ascending: false });
    
    if (roomId) {
      query = query.eq('room_id', roomId);
    }
    
    const { data: history, error } = await query;
    
    if (error) {
      console.error('[users/history] Database error:', error);
      throw error;
    }
    
    console.log('[users/history] Found', history?.length || 0, 'history entries');
    
    // Map kara_versions to song/version for backward compatibility
    const mapped = (history || []).map(item => {
      const version = (item as any).kara_versions;
      return {
        ...item,
        version: version || null,
        // Also provide as 'song' for backward compatibility
        song: version ? {
          id: version.id,
          title: version.title_display,
          artist: version.artist_name,
          tone: version.tone,
          mixer: version.mixer,
          style: version.style,
          performance_type: version.performance_type
        } : null
      };
    });
    
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
