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
    
    // 1. Calculate next position (simple max + 1)
    const { data: maxPosData } = await supabaseAdmin
      .from('kara_queue')
      .select('position')
      .eq('room_id', room_id)
      .in('status', ['pending', 'playing'])
      .order('position', { ascending: false })
      .limit(1)
      .maybeSingle();
    
    const position = (maxPosData?.position || 0) + 1;
    
    // 2. Insert into queue (stores version_id ONLY, not song_id)
    const { data, error } = await supabaseAdmin
      .from('kara_queue')
      .insert({
        room_id,
        version_id,  // ← Single source of truth
        user_id,
        position,
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
