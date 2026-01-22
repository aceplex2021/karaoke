import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/server/lib/supabase';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

/**
 * POST /api/rooms/[roomId]/advance
 * 
 * TV-only endpoint for playback transitions
 * Uses PostgreSQL function for atomic state machine
 * 
 * State transitions:
 * 1. current:playing → completed
 * 2. next:pending → playing
 * 3. room.current_entry_id updated
 * 
 * Called by:
 * - TV: video onEnded event
 * - TV: "Play Next" button
 * 
 * Rules enforced:
 * - Atomic transitions (no race conditions)
 * - Explicit state machine (pending → playing → completed)
 * - TV controls playback lifecycle
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
)  {
  try {
    const { roomId } = await params;
    
    console.log('[advance] Called for room:', roomId);
    
    // Use PostgreSQL function for atomic transition
    // Returns TRUE if advanced to next song, FALSE if queue empty
    const { data, error } = await supabaseAdmin
      .rpc('advance_playback', {
        p_room_id: roomId
      });
    
    if (error) {
      console.error('[advance] RPC error:', error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }
    
    if (data === false) {
      // No more songs in queue (normal end of queue)
      console.log('[advance] Queue empty, no more songs');
      return NextResponse.json({
        success: true,
        advanced: false,
        message: 'Queue empty'
      });
    }
    
    // Successfully advanced to next song
    console.log('[advance] Successfully advanced to next song');
    return NextResponse.json({
      success: true,
      advanced: true
    });
    
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    console.error('[advance] Error:', error);
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
