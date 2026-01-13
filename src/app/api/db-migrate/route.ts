import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/server/lib/supabase';

export const dynamic = 'force-dynamic';

/**
 * Database Reset Endpoint
 * Clears all queue data and resets room state
 * 
 * NOTE: Schema migrations must be run manually in Supabase SQL Editor:
 * 1. database/add_version_id_to_queue.sql
 * 2. database/create_advance_playback_function.sql
 */
export async function POST() {
  const roomId = '4f04b7e4-ebba-4590-9c35-bbdf2e67ce3f';
  
  try {
    // Step 1: Clear all queue entries (nuclear reset)
    const { error: deleteError } = await supabaseAdmin
      .from('kara_queue')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all
    
    // Step 2: Reset room pointers
    const { data: roomData, error: resetError } = await supabaseAdmin
      .from('kara_rooms')
      .update({ 
        current_entry_id: null,
        last_singer_id: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', roomId)
      .select();
    
    return NextResponse.json({
      success: !deleteError && !resetError,
      steps: {
        deleteQueue: deleteError ? deleteError.message : `OK - All entries deleted`,
        resetRoom: resetError ? resetError.message : `OK - Room reset`,
        roomState: roomData?.[0] || null
      },
      message: 'Database reset complete. Make sure to run SQL migrations manually in Supabase.'
    });
    
  } catch (error: any) {
    console.error('[db-migrate] Error:', error);
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}

