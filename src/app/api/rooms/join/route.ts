import { NextRequest, NextResponse } from 'next/server';

// Mark route as dynamic
export const dynamic = 'force-dynamic';
import { supabaseAdmin } from '@/server/lib/supabase';
import type { JoinRoomRequest, Room, User } from '@/shared/types';

/**
 * Join room (v3.5 + v4.0 approval mode support)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as JoinRoomRequest;
    const { room_code, user_fingerprint, display_name } = body;

    if (!room_code || !user_fingerprint) {
      return NextResponse.json(
        { error: 'room_code and user_fingerprint are required' },
        { status: 400 }
      );
    }

    // Get room
    const { data: room, error: roomError } = await supabaseAdmin
      .from('kara_rooms')
      .select('*')
      .eq('room_code', room_code.toUpperCase())
      .eq('is_active', true)
      .single();

    if (roomError || !room) {
      return NextResponse.json(
        { error: 'Room not found' },
        { status: 404 }
      );
    }

    // Phase 1: Check if room has expired
    if (room.expires_at && new Date(room.expires_at) < new Date()) {
      // Room has expired, mark as inactive
      await supabaseAdmin
        .from('kara_rooms')
        .update({ is_active: false })
        .eq('id', room.id);
      
      return NextResponse.json(
        { error: 'Room has expired' },
        { status: 410 } // 410 Gone
      );
    }

    // Get or create user (handle race condition for duplicate fingerprint)
    let user: any;
    const { data: existingUser } = await supabaseAdmin
      .from('kara_users')
      .select('*')
      .eq('fingerprint', user_fingerprint)
      .single();

    if (existingUser) {
      user = existingUser;
      // Update last seen and display name if provided
      await supabaseAdmin
        .from('kara_users')
        .update({
          last_seen_at: new Date().toISOString(),
          display_name: display_name || user.display_name,
        })
        .eq('id', user.id);
    } else {
      // Try to create user, but handle duplicate key error (race condition)
      const { data: newUser, error: insertError } = await supabaseAdmin
        .from('kara_users')
        .insert({
          fingerprint: user_fingerprint,
          display_name: display_name || 'Guest',
        })
        .select()
        .single();

      if (insertError) {
        // If duplicate key error, fetch the existing user
        if (insertError.code === '23505' || insertError.message.includes('duplicate')) {
          const { data: retryUser } = await supabaseAdmin
            .from('kara_users')
            .select('*')
            .eq('fingerprint', user_fingerprint)
            .single();
          if (retryUser) {
            user = retryUser;
          } else {
            throw new Error(`Failed to create user: ${insertError.message}`);
          }
        } else {
          throw new Error(`Failed to create user: ${insertError.message}`);
        }
      } else {
        user = newUser;
      }
    }

    // Phase 2.1: Smart cleanup - Remove only stale participations (>24h inactive)
    // This prevents users from being stuck in multiple rooms while allowing
    // users to return to recent rooms they were active in
    const staleThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    
    // Get all user's participations in other rooms
    const { data: otherParticipations, error: fetchError } = await supabaseAdmin
      .from('kara_room_participants')
      .select('id, last_active_at, role')
      .eq('user_id', user.id)
      .neq('room_id', room.id)
      .neq('role', 'host');  // Never remove hosts (they own the room)
    
    if (fetchError) {
      console.warn('[API /join] Warning: Failed to fetch other participations:', fetchError);
    } else if (otherParticipations && otherParticipations.length > 0) {
      // Filter to only stale participations (>24h inactive or null)
      const staleIds = otherParticipations
        .filter(p => !p.last_active_at || new Date(p.last_active_at) < new Date(staleThreshold))
        .map(p => p.id);
      
      if (staleIds.length > 0) {
        const { error: cleanupError } = await supabaseAdmin
          .from('kara_room_participants')
          .delete()
          .in('id', staleIds);
        
        if (cleanupError) {
          console.warn('[API /join] Warning: Failed to cleanup stale participations:', cleanupError);
        } else {
          console.log('[API /join] Cleaned up', staleIds.length, 'stale room participations for user:', user.id);
        }
      }
    }

    // Check if already participant in THIS room (e.g., host who just created room)
    const { data: existingParticipant } = await supabaseAdmin
      .from('kara_room_participants')
      .select('*')
      .eq('room_id', room.id)
      .eq('user_id', user.id)
      .single();

    if (existingParticipant) {
      // Update last active
      await supabaseAdmin
        .from('kara_room_participants')
        .update({ last_active_at: new Date().toISOString() })
        .eq('id', existingParticipant.id);
    } else {
      // Add new participant with v4.0 approval support
      const isHost = room.host_id === user.id;
      const needsApproval = room.approval_mode === 'approval' && !isHost;
      
      const insertData: any = {
        room_id: room.id,
        user_id: user.id,
        user_name: display_name || user.display_name || 'Guest', // v4.1: Cache user name for approval display
        role: isHost ? 'host' : 'user', // v4.0: Host role support
        status: needsApproval ? 'pending' : 'approved', // v4.0: Approval status
        expires_at: needsApproval ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : null, // v4.0: 15-min expiry
      };

      await supabaseAdmin.from('kara_room_participants').insert(insertData);
    }

    return NextResponse.json({
      room: room as Room,
      user: user as User,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    console.error('Error joining room:', error);
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
