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
 * Rules enforced:
 * - Stores version_id (not song_id)
 * - No ensurePlaying()
 * - No side effects
 * - Device waits for poll to see change
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { room_id, version_id, user_id } = body;
    
    // Validate required fields
    if (!room_id || !version_id || !user_id) {
      return NextResponse.json(
        { error: 'room_id, version_id, and user_id are required' },
        { status: 400 }
      );
    }
    
    // 1. Get room's queue_mode
    const { data: room, error: roomError } = await supabaseAdmin
      .from('kara_rooms')
      .select('queue_mode')
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
    
    // 2. Calculate position using PostgreSQL function (handles both FIFO and round-robin)
    const { data: positionData, error: posError } = await supabaseAdmin
      .rpc('calculate_round_robin_position', {
        p_room_id: room_id,
        p_user_id: user_id
      });
    
    let position: number;
    if (posError) {
      console.error('[queue/add] Position calculation error:', posError);
      // Fallback to simple max + 1 if function fails
      const { data: maxPosData } = await supabaseAdmin
        .from('kara_queue')
        .select('position')
        .eq('room_id', room_id)
        .in('status', ['pending', 'playing'])
        .order('position', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      position = (maxPosData?.position || 0) + 1;
    } else {
      position = positionData as number;
    }
    
    // 3. Calculate round_number for round-robin mode
    let roundNumber = 1;
    if (queueMode === 'round_robin') {
      // Get current round from pending songs
      const { data: pending } = await supabaseAdmin
        .from('kara_queue')
        .select('round_number')
        .eq('room_id', room_id)
        .eq('status', 'pending')
        .order('round_number', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      const currentRound = pending?.round_number || 1;
      
      // Check if user already has a song in current round
      const { data: userInRound } = await supabaseAdmin
        .from('kara_queue')
        .select('id')
        .eq('room_id', room_id)
        .eq('user_id', user_id)
        .eq('status', 'pending')
        .eq('round_number', currentRound)
        .limit(1)
        .maybeSingle();
      
      roundNumber = userInRound ? currentRound + 1 : currentRound;
    }
    
    // 4. Insert into queue (stores version_id ONLY, not song_id)
    const { data, error } = await supabaseAdmin
      .from('kara_queue')
      .insert({
        room_id,
        version_id,  // ← Single source of truth
        user_id,
        position,
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
    
    // 3. Return immediately (NO auto-start, NO ensurePlaying)
    // Device will see song in queue on next poll (≤3s)
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
