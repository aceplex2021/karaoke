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
    
    // First, check if history entries exist at all (without join)
    const { data: rawHistory, error: rawError } = await supabaseAdmin
      .from('kara_song_history')
      .select('id, song_id, user_id, sung_at')
      .eq('user_id', userId)
      .order('sung_at', { ascending: false })
      .limit(limit);
    
    console.log('[users/history/recent] Raw history entries (no join):', rawHistory?.length || 0);
    if (rawHistory && rawHistory.length > 0) {
      console.log('[users/history/recent] Sample raw entry:', {
        id: rawHistory[0].id,
        song_id: rawHistory[0].song_id,
        sung_at: rawHistory[0].sung_at,
      });
    }
    
    // Now do the join query
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
      console.error('[users/history/recent] Database error:', error);
      throw error;
    }
    
    console.log('[users/history/recent] Found', history?.length || 0, 'history entries (with join)');
    
    if (history && history.length > 0) {
      console.log('[users/history/recent] Sample entry:', {
        id: history[0].id,
        song_id: history[0].song_id,
        has_kara_songs: !!(history[0] as any).kara_songs,
        kara_songs_title: (history[0] as any).kara_songs?.title,
        kara_songs_artist: (history[0] as any).kara_songs?.artist,
      });
    } else if (rawHistory && rawHistory.length > 0) {
      console.warn('[users/history/recent] WARNING: Raw history has', rawHistory.length, 'entries but join returned', history?.length || 0);
      console.warn('[users/history/recent] This suggests the join with kara_songs is filtering out entries');
    }
    
    // If join failed (returned fewer entries), use rawHistory and fetch songs separately
    if (rawHistory && rawHistory.length > 0 && (!history || history.length === 0)) {
      console.log('[users/history/recent] Join failed, fetching songs separately for', rawHistory.length, 'entries');
      
      // Get all song_ids from rawHistory
      const songIds = rawHistory.map(h => h.song_id).filter(Boolean);
      
      if (songIds.length > 0) {
        const { data: songs, error: songsError } = await supabaseAdmin
          .from('kara_songs')
          .select('*')
          .in('id', songIds);
        
        if (!songsError && songs) {
          const songsMap = new Map(songs.map(s => [s.id, s]));
          
          // Map rawHistory with fetched songs
          const mapped = rawHistory.map(item => {
            const song = songsMap.get(item.song_id) || null;
            return {
              ...item,
              song,
            };
          });
          
          console.log('[users/history/recent] Fetched', songs.length, 'songs separately, mapped', mapped.length, 'entries');
          return NextResponse.json({ history: mapped });
        } else {
          console.error('[users/history/recent] Failed to fetch songs:', songsError);
        }
      }
      
      // Fallback: return rawHistory with null songs
      const mapped = rawHistory.map(item => ({
        ...item,
        song: null,
      }));
      return NextResponse.json({ history: mapped });
    }
    
    // Map kara_songs to song for backward compatibility (join worked)
    let mapped = (history || []).map(item => {
      const song = (item as any).kara_songs;
      if (!song) {
        console.warn('[users/history/recent] History entry missing kara_songs:', item.id, 'song_id:', item.song_id);
      }
      return {
        ...item,
        song: song || null,
      };
    });
    
    // If some songs are missing, fetch them separately
    const missingSongs = mapped.filter(m => !m.song && m.song_id);
    if (missingSongs.length > 0) {
      console.log('[users/history/recent] Fetching', missingSongs.length, 'missing songs separately');
      const songIds = missingSongs.map(m => m.song_id);
      
      const { data: songs, error: songsError } = await supabaseAdmin
        .from('kara_songs')
        .select('*')
        .in('id', songIds);
      
      if (!songsError && songs) {
        const songsMap = new Map(songs.map(s => [s.id, s]));
        mapped = mapped.map(item => {
          if (!item.song && item.song_id && songsMap.has(item.song_id)) {
            return {
              ...item,
              song: songsMap.get(item.song_id),
            };
          }
          return item;
        });
        console.log('[users/history/recent] Fetched', songs.length, 'songs separately');
      }
    }
    
    console.log('[users/history/recent] Mapped entries:', mapped.length, 'with songs:', mapped.filter(m => m.song).length);
    
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
