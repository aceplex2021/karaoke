import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/server/lib/supabase';
import type { Song } from '@/shared/types';

/**
 * Get song by ID
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { songId: string } }
) {
  try {
    const { songId } = params;

    const { data: song, error } = await supabaseAdmin
      .from('kara_songs')
      .select('*')
      .eq('id', songId)
      .single();

    if (error || !song) {
      return NextResponse.json(
        { error: 'Song not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ song: song as Song });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    console.error('Error fetching song:', error);
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

