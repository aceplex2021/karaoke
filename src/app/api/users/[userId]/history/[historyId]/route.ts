/**
 * DELETE /api/users/[userId]/history/[historyId]
 * Delete a song from user's history
 * v4.5.1: Allow users to remove songs they can't sing
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/server/lib/supabase';

// v4.5.1: Disable caching
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string; historyId: string }> }
) {
  try {
    const { userId, historyId } = await params;
    const { searchParams } = new URL(request.url);
    const sourceType = searchParams.get('source_type'); // 'database' or 'youtube'
    
    console.log('[DELETE history] User:', userId, 'History ID:', historyId, 'Source:', sourceType);
    
    if (!sourceType) {
      return NextResponse.json(
        { error: 'source_type query parameter is required' },
        { status: 400 }
      );
    }
    
    if (sourceType === 'database') {
      // Delete from kara_song_history
      const { error } = await supabaseAdmin
        .from('kara_song_history')
        .delete()
        .eq('id', historyId)
        .eq('user_id', userId); // Ensure user owns this history entry
      
      if (error) {
        console.error('[DELETE history] Database error:', error);
        return NextResponse.json(
          { error: 'Failed to delete history entry' },
          { status: 500 }
        );
      }
      
      console.log('[DELETE history] ✅ Deleted database history entry:', historyId);
    } else if (sourceType === 'youtube') {
      // Delete from kara_queue (completed YouTube song)
      const { error } = await supabaseAdmin
        .from('kara_queue')
        .delete()
        .eq('id', historyId)
        .eq('user_id', userId) // Ensure user owns this entry
        .eq('status', 'completed'); // Only allow deleting completed songs
      
      if (error) {
        console.error('[DELETE history] YouTube error:', error);
        return NextResponse.json(
          { error: 'Failed to delete history entry' },
          { status: 500 }
        );
      }
      
      console.log('[DELETE history] ✅ Deleted YouTube history entry:', historyId);
    } else {
      return NextResponse.json(
        { error: 'Invalid source_type. Must be "database" or "youtube"' },
        { status: 400 }
      );
    }
    
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    console.error('[DELETE history] Error:', error);
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
