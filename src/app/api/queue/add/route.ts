import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/server/lib/supabase';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

/**
 * POST /api/queue/add
 * 
 * Simple write endpoint - stores version_id only
 * Returns immediately - NO auto-start logic
 * 
 * Accepts either:
 * - version_id (direct version selection from Search tab)
 * - song_id (from History/Favorites - will select default version)
 * 
 * Rules enforced:
 * - Stores version_id (not song_id)
 * - No ensurePlaying()
 * - No side effects
 * - Device waits for poll to see change
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { room_id, version_id, song_id, user_id } = body;
    
    // Validate required fields
    if (!room_id || (!version_id && !song_id) || !user_id) {
      return NextResponse.json(
        { error: 'room_id, (version_id OR song_id), and user_id are required' },
        { status: 400 }
      );
    }
    
    // If song_id is provided instead of version_id, treat it as version_id
    // (In new schema, song_id === version_id, but we still support backward compat)
    let finalVersionId = version_id || song_id;
    
    if (!finalVersionId) {
      return NextResponse.json(
        { error: 'version_id or song_id is required' },
        { status: 400 }
      );
    }
    
    // Validate version exists
    const { data: versionCheck, error: versionError } = await supabaseAdmin
      .from('kara_versions')
      .select('id')
      .eq('id', finalVersionId)
      .single();
    
    if (versionError || !versionCheck) {
      console.error('[queue/add] Version not found:', finalVersionId, versionError);
      return NextResponse.json(
        { error: 'Version not found' },
        { status: 404 }
      );
    }
    
    // 1. Get room's queue_mode and current_entry_id
    const { data: room, error: roomError } = await supabaseAdmin
      .from('kara_rooms')
      .select('queue_mode, current_entry_id')
      .eq('id', room_id)
      .single();
    
    if (roomError || !room) {
      console.error('[queue/add] Room fetch error:', roomError);
      return NextResponse.json(
        { error: 'Room not found' },
        { status: 404 }
      );
    }
    
    const queueMode = room.queue_mode || 'fifo';
    
    // v4.7.0: Calculate sort_key using PostgreSQL function (returns sort_key, not position)
    const { data: sortKeyData, error: posError } = await supabaseAdmin
      .rpc('calculate_round_robin_position', {
        p_room_id: room_id,
        p_user_id: user_id
      });
    
    let sortKey: number;
    let position: number;
    if (posError) {
      console.error('[queue/add] Sort key calculation error:', posError);
      // Fallback to simple max + 1000.0 if function fails
      const { data: maxData } = await supabaseAdmin
        .from('kara_queue')
        .select('sort_key, position')
        .eq('room_id', room_id)
        .eq('status', 'pending')
        .order('sort_key', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      sortKey = (maxData?.sort_key || 0) + 1000.0;
      position = (maxData?.position || 0) + 1;
    } else {
      sortKey = sortKeyData as number;
      // Position will be calculated from sort_key order
      position = 1; // Temporary, will be updated by reorder function
    }
    
    // 3. Calculate round_number for round-robin mode
    // Round-robin: Each user gets ONE song per round maximum
    // Find the first round where this user doesn't have a song yet
    let roundNumber = 1;
    if (queueMode === 'round_robin') {
      // Get max round number
      const { data: maxRoundData } = await supabaseAdmin
        .from('kara_queue')
        .select('round_number')
        .eq('room_id', room_id)
        .eq('status', 'pending')
        .order('round_number', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      const maxRound = maxRoundData?.round_number || 0;
      
      // Find the first round (1 to maxRound+1) where this user doesn't have a song
      let foundRound = false;
      for (let round = 1; round <= maxRound + 1; round++) {
        const { data: userInRound } = await supabaseAdmin
          .from('kara_queue')
          .select('id')
          .eq('room_id', room_id)
          .eq('user_id', user_id)
          .eq('status', 'pending')
          .eq('round_number', round)
          .limit(1)
          .maybeSingle();
        
        if (!userInRound) {
          roundNumber = round;
          foundRound = true;
          break;
        }
      }
      
      // Fallback (shouldn't happen)
      if (!foundRound) {
        roundNumber = maxRound + 1;
      }
    }
    
    // v4.7.0: Insert into queue with sort_key for proper ordering
    const { data, error } = await supabaseAdmin
      .from('kara_queue')
      .insert({
        room_id,
        version_id: finalVersionId,  // ← Single source of truth
        user_id,
        position,
        sort_key: sortKey,  // v4.7.0: Essential for proper ordering
        round_number: roundNumber,
        status: 'pending'  // Always starts as pending
      })
      .select()
      .single();
    
    if (error) {
      console.error('[queue/add] Insert error:', error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }
    
    // v4.4: Auto-start first song - if no song is currently playing, start this one
    if (!room.current_entry_id) {
      console.log('[queue/add] No song currently playing - auto-starting:', data.id);
      
      // Update song status to 'playing'
      const { error: songError } = await supabaseAdmin
        .from('kara_queue')
        .update({ status: 'playing' })
        .eq('id', data.id);
      
      if (songError) {
        console.error('[queue/add] Failed to update song status:', songError);
        // Don't fail the request
      }
      
      // Set as current song
      const { error: roomError } = await supabaseAdmin
        .from('kara_rooms')
        .update({ current_entry_id: data.id })
        .eq('id', room_id);
      
      if (roomError) {
        console.error('[queue/add] Failed to auto-start song:', roomError);
        // Don't fail the request, song is still in queue
      } else {
        console.log('[queue/add] ✅ Auto-started first song (status: playing)');
      }
    }

    // Return immediately
    // Device will see song in queue on next poll or Realtime update
    return NextResponse.json({
      success: true,
      queueItem: data
    });
    
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    console.error('[queue/add] Error:', error);
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
