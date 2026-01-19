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
    
    console.log('[users/history/recent] Fetching recent songs for user:', userId, 'limit:', limit);
    
    // Query history with versions (updated for new schema)
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
      .eq('user_id', userId)
      .order('sung_at', { ascending: false })
      .limit(limit);
    
    if (error) {
      console.error('[users/history/recent] Database error:', error);
      throw error;
    }
    
    console.log('[users/history/recent] Found', history?.length || 0, 'history entries');
    
    // Map kara_versions to version for consistency
    const mapped = (history || []).map(item => {
      const version = (item as any).kara_versions;
      return {
        ...item,
        version: version || null,
      };
    });
    
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
