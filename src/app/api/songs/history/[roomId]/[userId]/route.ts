import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/server/lib/supabase';

/**
 * Get user's song history for a room (v4.0: includes both database and YouTube songs)
 * - Database songs: from kara_song_history
 * - YouTube songs: from kara_queue where played_at IS NOT NULL and source_type = 'youtube'
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ roomId: string; userId: string }> }
) {
  try {
    const { roomId, userId } = await params;

    // Fetch database song history (v3.5)
    const { data: dbHistory, error: dbError } = await supabaseAdmin
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

    if (dbError) {
      throw new Error(`Failed to fetch database history: ${dbError.message}`);
    }

    // Fetch YouTube song history (v4.0)
    // Note: advance_playback sets completed_at, not played_at
    // Include ALL completed songs with youtube_url (both new with source_type='youtube' and old without source_type)
    const { data: youtubeHistory, error: youtubeError } = await supabaseAdmin
      .from('kara_queue')
      .select('id, room_id, user_id, youtube_url, metadata, completed_at, added_at, source_type, version_id')
      .eq('room_id', roomId)
      .eq('user_id', userId)
      .eq('status', 'completed')
      .not('completed_at', 'is', null)
      .not('youtube_url', 'is', null) // Must have youtube_url to be a YouTube song
      .order('completed_at', { ascending: false });

    if (youtubeError) {
      throw new Error(`Failed to fetch YouTube history: ${youtubeError.message}`);
    }

    // Combine and normalize both histories
    const combinedHistory: any[] = [];

    // Add database songs
    if (dbHistory) {
      for (const item of dbHistory) {
        combinedHistory.push({
          id: item.id,
          room_id: item.room_id,
          user_id: item.user_id,
          version_id: item.version_id,
          sung_at: item.sung_at,
          times_sung: item.times_sung,
          source_type: 'database',
          version: item.kara_versions,
          song: item.kara_versions ? {
            title: item.kara_versions.title_display,
            artist: item.kara_versions.artist_name || 'Unknown',
            tone: item.kara_versions.tone,
            mixer: item.kara_versions.mixer,
            style: item.kara_versions.style,
          } : null,
        });
      }
    }

    // Add YouTube songs (filter to only actual YouTube songs)
    if (youtubeHistory) {
      // Filter: Only include entries that are actually YouTube songs
      // (source_type = 'youtube' OR has youtube_url but no version_id - catches old entries)
      const filteredYoutubeHistory = youtubeHistory.filter((item: any) => {
        return (item.source_type === 'youtube') || 
               (item.youtube_url && !item.version_id);
      });
      
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
    console.error('Error fetching history:', error);
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

