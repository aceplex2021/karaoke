import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/server/lib/supabase';

export const dynamic = 'force-dynamic';

/**
 * GET /api/users/[userId]/preferences
 * Get user preferences
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    const { userId } = params;
    
    const { data, error } = await supabaseAdmin
      .from('kara_user_preferences')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    
    if (error && error.code !== 'PGRST116') { // PGRST116 = not found
      throw error;
    }
    
    // Return defaults if not found
    return NextResponse.json({
      preferences: data || {
        preferred_language: 'en',
        preferred_version_type: null,
        auto_add_favorite: false,
      }
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    console.error('[users/preferences] Error:', error);
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/users/[userId]/preferences
 * Update user preferences
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    const { userId } = params;
    const body = await request.json();
    const { preferred_language, preferred_version_type, auto_add_favorite } = body;
    
    const { data, error } = await supabaseAdmin
      .from('kara_user_preferences')
      .upsert({
        user_id: userId,
        preferred_language: preferred_language || 'en',
        preferred_version_type: preferred_version_type || null,
        auto_add_favorite: auto_add_favorite || false,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id'
      })
      .select()
      .single();
    
    if (error) {
      throw error;
    }
    
    return NextResponse.json({ preferences: data });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    console.error('[users/preferences] Error:', error);
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
