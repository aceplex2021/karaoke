import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/server/lib/supabase';

/**
 * GET /api/users/:userId/favorites
 * Fetch user's favorite songs
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

    // Fetch song details for favorite songs
    const { data: songs, error: songsError } = await supabaseAdmin
      .from('kara_songs')
      .select('*')
      .in('id', favoriteSongIds);

    if (songsError) {
      console.error('[GET favorites] Error fetching songs:', songsError);
      return NextResponse.json({ error: 'Failed to fetch favorite songs' }, { status: 500 });
    }

    return NextResponse.json({ favorites: songs || [] });
  } catch (error) {
    console.error('[GET favorites] Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/users/:userId/favorites
 * Add a song to user's favorites
 * Body: { song_id: string }
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

    // Add song_id if not already in favorites
    if (!currentFavorites.includes(song_id)) {
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
    }

    return NextResponse.json({ success: true, message: 'Added to favorites' });
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
