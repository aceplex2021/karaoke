/**
 * API: Add YouTube Video to Queue
 * POST /api/queue/add-youtube
 * 
 * Adds a YouTube video to the queue in commercial mode
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
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
    const { data: room, error: roomError } = await supabase
      .from('kara_rooms')
      .select('id, is_active, approval_mode, queue_mode')
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
      const { data: participant, error: participantError } = await supabase
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

    // Calculate position based on queue mode
    let position = 1;
    let roundNumber = 1;
    const queueMode = room.queue_mode || 'fifo';

    if (queueMode === 'round_robin') {
      // Round-robin: Calculate fair position and round number
      
      // Get max round number
      const { data: maxRoundData } = await supabase
        .from('kara_queue')
        .select('round_number')
        .eq('room_id', room_id)
        .eq('status', 'pending')
        .order('round_number', { ascending: false })
        .limit(1);
      
      const maxRound = maxRoundData?.[0]?.round_number || 0;
      
      // Find the first round (1 to maxRound+1) where this user doesn't have a song
      let foundRound = false;
      for (let round = 1; round <= maxRound + 1; round++) {
        const { data: userInRound } = await supabase
          .from('kara_queue')
          .select('id')
          .eq('room_id', room_id)
          .eq('user_id', user_id)
          .eq('status', 'pending')
          .eq('round_number', round)
          .limit(1);
        
        if (!userInRound || userInRound.length === 0) {
          roundNumber = round;
          foundRound = true;
          break;
        }
      }
      
      // Fallback (shouldn't happen)
      if (!foundRound) {
        roundNumber = maxRound + 1;
      }

      // Calculate position: find last song in the same or previous round
      const { data: lastInRound } = await supabase
        .from('kara_queue')
        .select('position')
        .eq('room_id', room_id)
        .eq('status', 'pending')
        .lte('round_number', roundNumber)
        .order('position', { ascending: false })
        .limit(1);

      if (lastInRound && lastInRound.length > 0) {
        position = lastInRound[0].position + 1;
      }
    } else {
      // FIFO: Add to end
      const { data: lastSong } = await supabase
        .from('kara_queue')
        .select('position')
        .eq('room_id', room_id)
        .eq('status', 'pending')
        .order('position', { ascending: false })
        .limit(1);

      if (lastSong && lastSong.length > 0) {
        position = lastSong[0].position + 1;
      }
    }

    // Add to queue with metadata
    const { data: queueItem, error: insertError } = await supabase
      .from('kara_queue')
      .insert({
        room_id,
        user_id,
        position,
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
