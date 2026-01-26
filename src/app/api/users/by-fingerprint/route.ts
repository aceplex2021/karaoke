// Mark route as dynamic
export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/server/lib/supabase';

/**
 * Get user by fingerprint (lightweight check for name lookup)
 * Used to check if user exists in DB before showing name input modal
 * Future-proof for v5.0: Can extend to also check by auth_user_id
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const fingerprint = searchParams.get('fingerprint');

    if (!fingerprint) {
      return NextResponse.json(
        { error: 'fingerprint query parameter is required' },
        { status: 400 }
      );
    }

    // Get user by fingerprint
    const { data: user, error } = await supabaseAdmin
      .from('kara_users')
      .select('id, display_name, fingerprint')
      .eq('fingerprint', fingerprint)
      .single();

    if (error || !user) {
      // User doesn't exist - return null (not an error)
      return NextResponse.json({
        user: null,
        exists: false,
      });
    }

    // User exists - return their info
    return NextResponse.json({
      user: {
        id: user.id,
        display_name: user.display_name,
        fingerprint: user.fingerprint,
      },
      exists: true,
    });

  } catch (error: any) {
    console.error('[API] Error in by-fingerprint:', error);
    return NextResponse.json(
      { error: 'Internal server error', user: null, exists: false },
      { status: 500 }
    );
  }
}
