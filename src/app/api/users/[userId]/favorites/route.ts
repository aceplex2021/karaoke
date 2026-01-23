import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/server/lib/supabase';

/**
 * GET /api/users/:userId/favorites
 * Fetch user's favorite songs
 * v4.8.1: Deduplication happens here (display-time) not at save-time
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    const { userId } = params;

    // Get favorite_song_ids from kara_user_preferences
    const { data: preferences, error: prefError } = await supabaseAdmin
      .from('kara_user_preferences')
      .select('favorite_song_ids')
      .eq('user_id', userId)
      .single();

    if (prefError && prefError.code !== 'PGRST116') {
      // PGRST116 = no rows returned, which is OK (user has no preferences yet)
      console.error('[GET favorites] Error fetching preferences:', prefError);
      return NextResponse.json({ error: 'Failed to fetch preferences' }, { status: 500 });
    }

    const favoriteSongIds = (preferences?.favorite_song_ids as string[]) || [];

    if (favoriteSongIds.length === 0) {
      return NextResponse.json({ favorites: [] });
    }

    // v4.0: Favorites can be either version_ids (database) or queue_item_ids (YouTube)
    // Try to fetch as version_ids first
    const { data: versions, error: versionsError } = await supabaseAdmin
      .from('kara_versions')
      .select(`
        id,
        title_display,
        tone,
        mixer,
        style,
        artist_name,
        performance_type
      `)
      .in('id', favoriteSongIds);

    if (versionsError) {
      console.error('[GET favorites] Error fetching versions:', versionsError);
      return NextResponse.json({ error: 'Failed to fetch favorite versions' }, { status: 500 });
    }

    // Find which IDs were found as versions
    const foundVersionIds = new Set((versions || []).map(v => v.id));
    const notFoundIds = favoriteSongIds.filter(id => !foundVersionIds.has(id));

    // For IDs not found in versions, try fetching from queue (YouTube songs)
    let youtubeFavorites: any[] = [];
    if (notFoundIds.length > 0) {
      const { data: queueItems, error: queueError } = await supabaseAdmin
        .from('kara_queue')
        .select('id, youtube_url, metadata')
        .eq('source_type', 'youtube')
        .in('id', notFoundIds);

      if (queueError) {
        console.error('[GET favorites] Error fetching YouTube queue items:', queueError);
      } else if (queueItems) {
        // Format YouTube items to match version structure
        youtubeFavorites = queueItems.map(item => {
          const metadata = item.metadata || {};
          return {
            id: item.id,
            title_display: metadata.title || 'YouTube Video',
            artist_name: 'YouTube',
            tone: null,
            mixer: null,
            style: null,
            performance_type: null,
            youtube_url: item.youtube_url,
            metadata: metadata,
            source_type: 'youtube',
          };
        });
      }
    }

    // Combine database and YouTube favorites
    const allFavorites = [...(versions || []), ...youtubeFavorites];

    // v4.8.1: Deduplicate YouTube URLs at display-time (not save-time)
    // Keep first occurrence, remove duplicates by URL
    const seenYoutubeUrls = new Set<string>();
    const deduplicatedFavorites = allFavorites.filter(fav => {
      if (fav.youtube_url) {
        if (seenYoutubeUrls.has(fav.youtube_url)) {
          return false; // Skip duplicate URL
        }
        seenYoutubeUrls.add(fav.youtube_url);
      }
      return true;
    });

    // Auto-cleanup: If we removed duplicates, update database
    if (deduplicatedFavorites.length < allFavorites.length) {
      const cleanedIds = deduplicatedFavorites.map(f => f.id);
      console.log('[GET favorites] Auto-cleaning duplicates:', allFavorites.length, '→', cleanedIds.length);
      
      await supabaseAdmin
        .from('kara_user_preferences')
        .update({
          favorite_song_ids: cleanedIds,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId);
    }

    // v4.6.1: Sort alphabetically by title
    deduplicatedFavorites.sort((a, b) => {
      const titleA = (a.title_display || '').toLowerCase();
      const titleB = (b.title_display || '').toLowerCase();
      return titleA.localeCompare(titleB);
    });

    return NextResponse.json({ favorites: deduplicatedFavorites });
  } catch (error) {
    console.error('[GET favorites] Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/users/:userId/favorites
 * Add a song to user's favorites
 * Body: { song_id: string }
 * v4.8.1: Simplified - just check if ID already in array
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    const { userId } = params;
    const body = await request.json();
    const { song_id } = body;

    if (!song_id) {
      return NextResponse.json({ error: 'song_id is required' }, { status: 400 });
    }

    // Get current favorite_song_ids
    const { data: preferences, error: prefError } = await supabaseAdmin
      .from('kara_user_preferences')
      .select('favorite_song_ids')
      .eq('user_id', userId)
      .maybeSingle();

    if (prefError) {
      console.error('[POST favorites] Error fetching preferences:', prefError);
      return NextResponse.json({ error: 'Failed to fetch preferences' }, { status: 500 });
    }

    const currentFavorites = (preferences?.favorite_song_ids as string[]) || [];

    // Check if already in favorites
    if (currentFavorites.includes(song_id)) {
      return NextResponse.json({ 
        success: true, 
        message: 'Already in favorites'
      });
    }

    // Add to favorites
    const updatedFavorites = [...currentFavorites, song_id];

    // Upsert kara_user_preferences
    const { error: upsertError } = await supabaseAdmin
      .from('kara_user_preferences')
      .upsert({
        user_id: userId,
        favorite_song_ids: updatedFavorites,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id'
      });

    if (upsertError) {
      console.error('[POST favorites] Error upserting preferences:', upsertError);
      return NextResponse.json({ error: 'Failed to add favorite' }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Added to favorites'
    });
  } catch (error) {
    console.error('[POST favorites] Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/users/:userId/favorites?songId=<uuid>
 * Remove a song from user's favorites
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    const { userId } = params;
    const { searchParams } = new URL(request.url);
    const songId = searchParams.get('songId');

    if (!songId) {
      return NextResponse.json({ error: 'songId query parameter is required' }, { status: 400 });
    }

    // Get current favorite_song_ids
    const { data: preferences, error: prefError } = await supabaseAdmin
      .from('kara_user_preferences')
      .select('favorite_song_ids')
      .eq('user_id', userId)
      .maybeSingle();

    if (prefError) {
      console.error('[DELETE favorites] Error fetching preferences:', prefError);
      return NextResponse.json({ error: 'Failed to fetch preferences' }, { status: 500 });
    }

    const currentFavorites = (preferences?.favorite_song_ids as string[]) || [];

    // Remove song_id from favorites
    const updatedFavorites = currentFavorites.filter(id => id !== songId);

    // Upsert kara_user_preferences
    const { error: upsertError } = await supabaseAdmin
      .from('kara_user_preferences')
      .upsert({
        user_id: userId,
        favorite_song_ids: updatedFavorites,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id'
      });

    if (upsertError) {
      console.error('[DELETE favorites] Error upserting preferences:', upsertError);
      return NextResponse.json({ error: 'Failed to remove favorite' }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Removed from favorites' });
  } catch (error) {
    console.error('[DELETE favorites] Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
