import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/server/lib/supabase';

export const dynamic = 'force-dynamic';

/**
 * GET /api/users/[userId]/history
 * Get user's song history (user-global, not room-specific)
 * v4.0: Includes both database and YouTube songs
 * v4.5.2: History is now user-global across all rooms
 * Returns last 12 months by default
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    const { userId } = params;
    
    // Calculate 12 months ago
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
    
    console.log('[users/history] Fetching user-global history for user:', userId, 'since:', twelveMonthsAgo.toISOString());
    
    // Fetch database song history (v3.5) - v4.5.2: No room filter
    const dbQuery = supabaseAdmin
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
    
    const { data: dbHistory, error: dbError } = await dbQuery;
    
    if (dbError) {
      console.error('[users/history] Database error:', dbError);
      throw dbError;
    }
    
    // Fetch YouTube song history (v4.0) - v4.5.2: No room filter
    // Note: advance_playback sets completed_at, not played_at
    // Include ALL completed songs with youtube_url (both new with source_type='youtube' and old without source_type)
    const youtubeQuery = supabaseAdmin
      .from('kara_queue')
      .select('id, room_id, user_id, youtube_url, metadata, completed_at, added_at, source_type, version_id')
      .eq('user_id', userId)
      .eq('status', 'completed')
      .not('completed_at', 'is', null)
      .not('youtube_url', 'is', null) // Must have youtube_url to be a YouTube song
      .gte('completed_at', twelveMonthsAgo.toISOString())
      .order('completed_at', { ascending: false });
    
    const { data: youtubeHistory, error: youtubeError } = await youtubeQuery;
    
    if (youtubeError) {
      console.error('[users/history] YouTube history error:', youtubeError);
      // Don't throw - just log, continue with database history
    }
    
    // Filter results: Only include entries that are actually YouTube songs
    // (source_type = 'youtube' OR has youtube_url but no version_id - catches old entries)
    const filteredYoutubeHistory = (youtubeHistory || []).filter((item: any) => {
      // Include if:
      // 1. Explicitly marked as YouTube (source_type = 'youtube'), OR
      // 2. Has youtube_url and no version_id (old entries before source_type was added)
      return (item.source_type === 'youtube') || 
             (item.youtube_url && !item.version_id);
    });
    
    console.log('[users/history] Found', dbHistory?.length || 0, 'database entries,', filteredYoutubeHistory.length, 'YouTube entries');
    
    // Combine and normalize both histories
    const combinedHistory: any[] = [];
    
    // Add database songs
    if (dbHistory) {
      for (const item of dbHistory) {
        const version = (item as any).kara_versions;
        combinedHistory.push({
          id: item.id,
          room_id: item.room_id,
          user_id: item.user_id,
          version_id: item.version_id,
          sung_at: item.sung_at,
          times_sung: item.times_sung,
          source_type: 'database',
          version: version || null,
          song: version ? {
            id: version.id,
            title: version.title_display,
            artist: version.artist_name || 'Unknown',
            tone: version.tone,
            mixer: version.mixer,
            style: version.style,
            performance_type: version.performance_type
          } : null
        });
      }
    }
    
    // Add YouTube songs (both new with source_type and old without)
    if (filteredYoutubeHistory) {
      for (const item of filteredYoutubeHistory) {
        const metadata = item.metadata || {};
        combinedHistory.push({
          id: item.id,
          room_id: item.room_id,
          user_id: item.user_id,
          version_id: null,
          sung_at: item.completed_at, // Use completed_at as the "sung_at" equivalent
          times_sung: 1, // YouTube songs don't track times_sung
          source_type: 'youtube',
          youtube_url: item.youtube_url,
          metadata: metadata,
          version: null,
          song: {
            title: metadata.title || 'YouTube Video',
            artist: 'YouTube',
            youtube_url: item.youtube_url,
          },
        });
      }
    }
    
    // Sort by sung_at/played_at (most recent first)
    combinedHistory.sort((a, b) => {
      const dateA = new Date(a.sung_at).getTime();
      const dateB = new Date(b.sung_at).getTime();
      return dateB - dateA;
    });
    
    return NextResponse.json({ history: combinedHistory });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    console.error('[users/history] Error:', error);
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
