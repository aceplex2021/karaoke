/**
 * API: Get All Participants in Room
 * GET /api/rooms/[roomId]/participants
 * 
 * Returns all participants (pending, approved, denied, expired)
 * For host's full participant management view
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/server/lib/supabase';

// v4.4.1: Disable Next.js caching - CRITICAL for real-time approval
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  try {
    const { roomId } = await params;

    console.log('[API /participants] 🔍 Fetching participants for room:', roomId);

    // Get all participants
    const { data: participants, error } = await supabaseAdmin
      .from('kara_room_participants')
      .select('id, user_id, user_name, role, status, joined_at, approved_at, expires_at, last_active_at')
      .eq('room_id', roomId)
      .order('joined_at', { ascending: true });

    if (error) {
      console.error('[API /participants] ❌ Error fetching participants:', error);
      return NextResponse.json(
        { error: 'Failed to fetch participants' },
        { status: 500 }
      );
    }

    console.log('[API /participants] 📊 Raw DB results:', {
      count: participants?.length || 0,
      users: participants?.map(p => `${p.user_name}(${p.user_id.slice(-4)}) - ${p.status}`) || []
    });

    // Check for expired pending requests
    const now = new Date();
    const categorized = {
      approved: [] as any[],
      pending: [] as any[],
      denied: [] as any[],
      expired: [] as any[],
    };

    participants?.forEach(p => {
      if (p.status === 'pending' && p.expires_at) {
        const expiresAt = new Date(p.expires_at);
        if (expiresAt < now) {
          // Mark as expired for display (but don't auto-deny yet)
          categorized.expired.push({ ...p, displayStatus: 'expired' });
        } else {
          categorized.pending.push(p);
        }
      } else if (p.status === 'approved') {
        categorized.approved.push(p);
      } else if (p.status === 'denied') {
        categorized.denied.push(p);
      }
    });

    return NextResponse.json({
      participants: participants || [],
      categorized,
      total: participants?.length || 0,
    });

  } catch (error: any) {
    console.error('[API] Error in participants:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
