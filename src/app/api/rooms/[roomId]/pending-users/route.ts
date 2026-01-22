/**
 * API: Get Pending Users for Approval
 * GET /api/rooms/[roomId]/pending-users
 * 
 * Returns list of users waiting for host approval
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  try {
    const { roomId } = await params;

    // Get pending users
    const { data: pendingUsers, error } = await supabase
      .from('kara_room_participants')
      .select('id, user_id, user_name, joined_at, expires_at')
      .eq('room_id', roomId)
      .eq('status', 'pending')
      .order('joined_at', { ascending: true });

    if (error) {
      console.error('[API] Error fetching pending users:', error);
      return NextResponse.json(
        { error: 'Failed to fetch pending users' },
        { status: 500 }
      );
    }

    // Expire old pending requests
    const now = new Date().toISOString();
    const expired = pendingUsers?.filter(u => u.expires_at && u.expires_at < now) || [];
    
    if (expired.length > 0) {
      // Auto-deny expired requests
      await supabase
        .from('kara_room_participants')
        .update({ status: 'denied' })
        .in('id', expired.map(u => u.id));
      
      // Filter out expired from results
      const active = pendingUsers?.filter(u => !u.expires_at || u.expires_at >= now) || [];
      
      return NextResponse.json({
        pending: active,
        expired: expired.length,
      });
    }

    return NextResponse.json({
      pending: pendingUsers || [],
      expired: 0,
    });

  } catch (error: any) {
    console.error('[API] Error in pending-users:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
