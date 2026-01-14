import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/server/lib/supabase';

export const dynamic = 'force-dynamic';

/**
 * GET /api/users/[userId]/history/recent?limit=20
 * Get user's most recent songs (across all rooms)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    const { userId } = params;
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    
    const { data: history, error } = await supabaseAdmin
      .from('kara_song_history')
      .select(`
        *,
        kara_songs(*)
      `)
      .eq('user_id', userId)
      .order('sung_at', { ascending: false })
      .limit(limit);
    
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
    console.error('[users/history/recent] Error:', error);
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
