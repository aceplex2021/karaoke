import { NextRequest, NextResponse } from 'next/server';

// Mark route as dynamic
export const dynamic = 'force-dynamic';
import { supabaseAdmin } from '@/server/lib/supabase';
import type { CreateRoomRequest, Room, User } from '@/shared/types';

/**
 * Generate a unique 6-character room code
 */
async function generateUniqueRoomCode(): Promise<string> {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude confusing chars
  let code = '';
  
  // Try up to 10 times to find a unique code
  for (let attempt = 0; attempt < 10; attempt++) {
    code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    
    // Check if code exists
    const { data } = await supabaseAdmin
      .from('kara_rooms')
      .select('id')
      .eq('room_code', code)
      .single();
    
    if (!data) {
      return code; // Code is unique
    }
  }
  
  throw new Error('Failed to generate unique room code');
}

/**
 * Create a new room (TV mode)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as CreateRoomRequest;
    const { room_name, host_fingerprint, host_display_name, queue_mode, approval_mode } = body;

    if (!room_name || !host_fingerprint) {
      return NextResponse.json(
        { error: 'room_name and host_fingerprint are required' },
        { status: 400 }
      );
    }

    // Validate queue_mode (default to 'fifo' if invalid or missing)
    const validModes = ['round_robin', 'fifo'];
    const selectedMode = queue_mode && validModes.includes(queue_mode) 
      ? queue_mode 
      : 'fifo'; // Default to FIFO to maintain current behavior

    // Validate approval_mode (default to 'auto' if invalid or missing)
    const validApprovalModes = ['auto', 'approval'];
    const selectedApprovalMode = approval_mode && validApprovalModes.includes(approval_mode)
      ? approval_mode
      : 'auto'; // Default to auto for backward compatibility

    // Get or create user
    let { data: user } = await supabaseAdmin
      .from('kara_users')
      .select('*')
      .eq('fingerprint', host_fingerprint)
      .single();

    if (!user) {
      const { data: newUser, error: userError } = await supabaseAdmin
        .from('kara_users')
        .insert({
          fingerprint: host_fingerprint,
          display_name: host_display_name || 'Host',
        })
        .select()
        .single();

      if (userError) {
        throw new Error(`Failed to create user: ${userError.message}`);
      }

      user = newUser;
    } else {
      // Update last seen
      await supabaseAdmin
        .from('kara_users')
        .update({ last_seen_at: new Date().toISOString() })
        .eq('id', user.id);
    }

    // Generate unique room code
    const roomCode = await generateUniqueRoomCode();

    // Phase 1: Set expires_at explicitly (24 hours from now)
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    // Create room
    const { data: room, error: roomError } = await supabaseAdmin
      .from('kara_rooms')
      .insert({
        room_code: roomCode,
        room_name,
        host_id: user.id,
        queue_mode: selectedMode, // Add queue mode
        approval_mode: selectedApprovalMode, // v4.0: Add approval mode
        expires_at: expiresAt.toISOString(), // Phase 1: Explicitly set expiry
      })
      .select()
      .single();

    if (roomError) {
      throw new Error(`Failed to create room: ${roomError.message}`);
    }

    // Add host as participant
    await supabaseAdmin.from('kara_room_participants').insert({
      room_id: room.id,
      user_id: user.id,
      user_name: host_display_name || 'Host',
      role: 'host',
      status: 'approved', // v4.0: Host is always approved
    });

    return NextResponse.json({
      room: room as Room,
      user: user as User,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    console.error('Error creating room:', error);
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

