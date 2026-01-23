/**
 * API: Add YouTube Video to Queue
 * POST /api/queue/add-youtube
 * 
 * Adds a YouTube video to the queue in commercial mode
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/server/lib/supabase';
import { extractYouTubeId, isValidYouTubeUrl } from '@/lib/youtube';
import { appConfig } from '@/lib/config';

export async function POST(request: NextRequest) {
  try {
    // Check if YouTube mode is enabled
    if (!appConfig.features.youtubePlayback) {
      return NextResponse.json(
        { error: 'YouTube mode not enabled' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { room_id, user_id, youtube_url, title, user_name } = body;

    // Validate required fields
    if (!room_id || !user_id || !youtube_url) {
      return NextResponse.json(
        { error: 'Missing required fields: room_id, user_id, youtube_url' },
        { status: 400 }
      );
    }

    // Validate YouTube URL
    if (!isValidYouTubeUrl(youtube_url)) {
      return NextResponse.json(
        { error: 'Invalid YouTube URL' },
        { status: 400 }
      );
    }

    // Extract video ID
    const videoId = extractYouTubeId(youtube_url);
    if (!videoId) {
      return NextResponse.json(
        { error: 'Could not extract video ID from URL' },
        { status: 400 }
      );
    }

    console.log('[API] Adding YouTube video to queue:', {
      room_id,
      user_id,
      videoId,
      title,
    });

    // Fetch video title from YouTube if not provided
    let videoTitle = title || 'YouTube Video';
    if (!title || title.trim() === '') {
      try {
        // Use YouTube oEmbed API (no API key required)
        const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(youtube_url)}&format=json`;
        const response = await fetch(oembedUrl);
        
        if (response.ok) {
          const data = await response.json();
          videoTitle = data.title || 'YouTube Video';
          console.log('[API] Fetched YouTube title:', videoTitle);
        } else {
          console.warn('[API] Failed to fetch YouTube title, using default');
        }
      } catch (error) {
        console.error('[API] Error fetching YouTube title:', error);
        // Continue with default title
      }
    }

    // Check if room exists and is active
    const { data: room, error: roomError } = await supabaseAdmin
      .from('kara_rooms')
      .select('id, is_active, approval_mode, queue_mode, current_entry_id')
      .eq('id', room_id)
      .single();

    if (roomError || !room) {
      return NextResponse.json(
        { error: 'Room not found' },
        { status: 404 }
      );
    }

    if (!room.is_active) {
      return NextResponse.json(
        { error: 'Room is not active' },
        { status: 400 }
      );
    }

    // Check user approval status (if approval mode enabled)
    if (room.approval_mode === 'approval') {
      const { data: participant, error: participantError } = await supabaseAdmin
        .from('kara_room_participants')
        .select('status')
        .eq('room_id', room_id)
        .eq('user_id', user_id)
        .single();

      if (participantError || !participant) {
        return NextResponse.json(
          { error: 'User not found in room' },
          { status: 404 }
        );
      }

      if (participant.status !== 'approved') {
        return NextResponse.json(
          { error: 'User not approved to add songs' },
          { status: 403 }
        );
      }
    }

    // v4.7.0: Calculate sort_key for proper ordering (replaces position-based logic)
    let sortKey = 1000.0;
    let position = 1;
    let roundNumber = 1;
    const queueMode = room.queue_mode || 'fifo';

    if (queueMode === 'round_robin') {
      // Round-robin: Use calculate_round_robin_position function
      const { data: rrData, error: rrError } = await supabaseAdmin
        .rpc('calculate_round_robin_position', {
          p_room_id: room_id,
          p_user_id: user_id
        });

      if (rrError) {
        console.error('[API] Error calculating round-robin position:', rrError);
        // Fallback to end of queue
        const { data: lastSong } = await supabaseAdmin
          .from('kara_queue')
          .select('sort_key, position, round_number')
          .eq('room_id', room_id)
          .eq('status', 'pending')
          .order('sort_key', { ascending: false })
          .limit(1);
        
        sortKey = lastSong?.[0]?.sort_key ? lastSong[0].sort_key + 1000.0 : 1000.0;
        position = lastSong?.[0]?.position ? lastSong[0].position + 1 : 1;
        roundNumber = lastSong?.[0]?.round_number || 1;
      } else {
        sortKey = rrData || 1000.0;
        
        // Get max round number for this user to determine round_number
        const { data: userRounds } = await supabaseAdmin
          .from('kara_queue')
          .select('round_number')
          .eq('room_id', room_id)
          .eq('user_id', user_id)
          .eq('status', 'pending')
          .order('round_number', { ascending: false })
          .limit(1);
        
        roundNumber = userRounds?.[0]?.round_number ? userRounds[0].round_number + 1 : 1;
        
        // Position will be recalculated by trigger/function
        position = 1; // Temporary, will be updated
      }
    } else {
      // FIFO: Add to end with spacing
      const { data: lastSong } = await supabaseAdmin
        .from('kara_queue')
        .select('sort_key, position')
        .eq('room_id', room_id)
        .eq('status', 'pending')
        .order('sort_key', { ascending: false })
        .limit(1);

      if (lastSong && lastSong.length > 0) {
        sortKey = lastSong[0].sort_key + 1000.0;
        position = lastSong[0].position + 1;
      }
    }

    // v4.7.0: Add to queue with metadata (includes sort_key)
    const { data: queueItem, error: insertError } = await supabaseAdmin
      .from('kara_queue')
      .insert({
        room_id,
        user_id,
        position,
        sort_key: sortKey, // v4.7.0: Essential for proper ordering
        round_number: roundNumber,
        source_type: 'youtube',
        youtube_url,
        version_id: null, // YouTube entries don't have version_id
        status: 'pending',
        metadata: {
          title: videoTitle,
          videoId: videoId,
          sharedAt: new Date().toISOString(),
        },
      })
      .select()
      .single();

    if (insertError) {
      console.error('[API] Error inserting queue item:', insertError);
      return NextResponse.json(
        { error: 'Failed to add to queue', details: insertError.message },
        { status: 500 }
      );
    }

    console.log('[API] Successfully added to queue:', queueItem);

    // v4.4: Auto-start first song - if no song is currently playing, start this one
    if (!room.current_entry_id) {
      console.log('[API] No song currently playing - auto-starting:', queueItem.id);
      
      // Update song status to 'playing'
      const { error: songError } = await supabaseAdmin
        .from('kara_queue')
        .update({ status: 'playing' })
        .eq('id', queueItem.id);
      
      if (songError) {
        console.error('[API] Failed to update song status:', songError);
        // Don't fail the request
      }
      
      // Set as current song
      const { error: roomError } = await supabaseAdmin
        .from('kara_rooms')
        .update({ current_entry_id: queueItem.id })
        .eq('id', room_id);
      
      if (roomError) {
        console.error('[API] Failed to auto-start song:', roomError);
        // Don't fail the request, song is still in queue
      } else {
        console.log('[API] ✅ Auto-started first song (status: playing)');
      }
    }

    return NextResponse.json({
      success: true,
      queue_item: queueItem,
      position,
    });

  } catch (error: any) {
    console.error('[API] Error in add-youtube:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
