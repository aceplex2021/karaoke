'use client';

import { useEffect, useState, useRef, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { v4 as uuidv4 } from 'uuid';
import { api } from '@/lib/api';
import type { ReorderQueueRequest } from '@/shared/types';
import { getQRCodeUrl } from '@/lib/utils';
import QRCode from '@/components/QRCode';
import type { Room, QueueItem } from '@/shared/types';
import { YouTubePlayer } from '@/components/YouTubePlayer';
import { appConfig } from '@/lib/config';
import { extractYouTubeId } from '@/lib/youtube';

/**
 * Format seconds to MM:SS or HH:MM:SS
 */
function formatTime(seconds: number): string {
  if (!isFinite(seconds) || isNaN(seconds)) return '0:00';
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

/**
 * TV Mode - Passive playback client (Checkpoint B)
 * Backend is the only playback authority.
 * TV only:
 * 1. Polls room state every 2.5 seconds
 * 2. Fetches canonical state via getRoomState()
 * 3. Plays the URL from currentSong
 * 4. Reports ended/error to backend
 */
function TVModePageContent() {
  const searchParams = useSearchParams();
  const roomIdParam = searchParams.get('roomId');
  const codeParam = searchParams.get('code');
  
  const [room, setRoom] = useState<Room | null>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [currentSong, setCurrentSong] = useState<QueueItem | null>(null);
  const [upNext, setUpNext] = useState<QueueItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tvUserId, setTvUserId] = useState<string | null>(null); // Host user ID from localStorage
  const [tvId, setTvId] = useState<string | null>(null); // Unique ID for this TV instance
  const [isPrimaryTV, setIsPrimaryTV] = useState(false); // Is this the primary TV (with audio)?
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [needsUserInteraction, setNeedsUserInteraction] = useState(false);
  const [hasUserInteracted, setHasUserInteracted] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [volume, setVolume] = useState(1);
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false); // Mobile sidebar toggle
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  
  // Prevent stale refresh overwrites
  const requestIdRef = useRef<number>(0);
  const roomIdRef = useRef<string | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const currentVideoSrcRef = useRef<string | null>(null);
  const currentSongRef = useRef<QueueItem | null>(null);
  const roomRef = useRef<Room | null>(null);
  const playingQueueItemIdRef = useRef<string | null>(null); // Track which queue item ID is actually playing
  const isAdvancingRef = useRef<boolean>(false); // Prevent double-firing of handleEnded
  const sidebarTimerRef = useRef<NodeJS.Timeout | null>(null); // Auto-hide sidebar timer

  // Load room from localStorage or URL - setup polling
  useEffect(() => {
    const storedRoomId = localStorage.getItem('tv_room_id');
    const storedUserId = localStorage.getItem('tv_user_id'); // Host user ID

    // Load host user ID
    if (storedUserId) {
      setTvUserId(storedUserId);
      console.log('[tv] Loaded host user ID from localStorage:', storedUserId);
    }

    // Generate or load unique TV ID
    let currentTvId = localStorage.getItem('tv_id');
    if (!currentTvId) {
      // Generate new UUID for this TV
      currentTvId = uuidv4();
      localStorage.setItem('tv_id', currentTvId);
      console.log('[tv] Generated new TV ID:', currentTvId);
    } else {
      console.log('[tv] Loaded TV ID from localStorage:', currentTvId);
    }
    setTvId(currentTvId);

    // Resolve room: code > roomId param > localStorage
    const resolveAndLoadRoom = async () => {
      let roomId: string | null = null;

      // Priority 1: Resolve code to roomId
      if (codeParam) {
        const code = codeParam.toUpperCase();
        console.log('[tv] Resolving code:', code);
        try {
          const response = await fetch(`/api/rooms/code/${code}`);
          if (response.ok) {
            const data = await response.json();
            roomId = data.room.id as string;
            console.log('[tv] Resolved code to roomId:', roomId);
            // Save to localStorage for future loads
            localStorage.setItem('tv_room_id', roomId);
          } else {
            setError(`Room code "${code}" not found`);
            setLoading(false);
            return;
          }
        } catch (err) {
          console.error('[tv] Error resolving code:', err);
          setError('Failed to resolve room code');
          setLoading(false);
          return;
        }
      }
      // Priority 2: Direct roomId param
      else if (roomIdParam) {
        roomId = roomIdParam;
        localStorage.setItem('tv_room_id', roomId);
      }
      // Priority 3: localStorage
      else if (storedRoomId) {
        roomId = storedRoomId;
      }

      if (!roomId) {
        setError('No room ID or code found. Please scan QR code or create a room first.');
        setLoading(false);
        return;
      }

      // Cleanup previous polling if roomId changed
      if (pollingIntervalRef.current && roomIdRef.current !== roomId) {
        console.log('[tv] Room ID changed, cleaning up previous polling');
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }

      loadRoom(roomId);
    };

    resolveAndLoadRoom();
    
    // Cleanup on unmount or roomId change
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [codeParam, roomIdParam]);

  // Leave page warning (v4.3)
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = ''; // Required for Chrome
      return 'Are you sure you want to leave? This will close the TV display.';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  // Auto-hide sidebar after 10 seconds of inactivity
  useEffect(() => {
    // Only run on client-side
    if (typeof window === 'undefined') return;
    
    console.log('[tv] Sidebar state changed:', showSidebar, 'Timer ref:', sidebarTimerRef.current);
    if (showSidebar) {
      // Clear any existing timer
      if (sidebarTimerRef.current) {
        console.log('[tv] Clearing existing sidebar timer:', sidebarTimerRef.current);
        clearTimeout(sidebarTimerRef.current);
      }
      
      // Set new timer for 10 seconds
      console.log('[tv] Setting 10-second auto-hide timer at', new Date().toISOString());
      const timerId = setTimeout(() => {
        console.log('[tv] Auto-hide timer fired - closing sidebar at', new Date().toISOString());
        setShowSidebar(false);
      }, 10000);
      sidebarTimerRef.current = timerId;
      console.log('[tv] Timer ID stored:', timerId);
    } else {
      // Clear timer when sidebar is closed
      if (sidebarTimerRef.current) {
        console.log('[tv] Sidebar closed manually - clearing timer:', sidebarTimerRef.current);
        clearTimeout(sidebarTimerRef.current);
        sidebarTimerRef.current = null;
      }
    }
    
    // Cleanup on unmount
    return () => {
      if (sidebarTimerRef.current) {
        console.log('[tv] Cleaning up sidebar timer on unmount:', sidebarTimerRef.current);
        clearTimeout(sidebarTimerRef.current);
      }
    };
  }, [showSidebar]);

  /**
   * Deterministic refresh function (canonical HTTP fetch)
   * Fetches complete room state from backend (single source of truth)
   * Always renders the song referenced by room.current_entry_id (single source of truth)
   * Uses requestIdRef to prevent stale overwrites
   * Memoized with useCallback to ensure stable reference for debounced function
   */
  const refreshState = useCallback(async (roomId: string) => {
    const requestId = ++requestIdRef.current;
    console.log('[tv] refreshState called for room:', roomId);
    try {
      const state = await api.getRoomState(roomId);
      console.log('[tv] refreshState received state:', {
        roomId: state.room.id,
        current_entry_id: state.room.current_entry_id,
        currentSong: state.currentSong ? { id: state.currentSong.id, title: state.currentSong.song?.title } : null,
        queueLength: state.queue.length
      });
      
      // DETAILED DEBUG: Show full currentSong structure
      if (state.currentSong) {
        console.log('[tv] FULL currentSong:', JSON.stringify(state.currentSong, null, 2));
      }
      
      // Only update if this is still the latest request
      if (requestId === requestIdRef.current) {
        console.log('[tv] refreshState current_entry_id:', state.room.current_entry_id);
        setRoom(state.room);
        roomRef.current = state.room;
        // Always use currentSong from backend (based on room.current_entry_id)
        // Do NOT pick current from queue ordering - backend is single source of truth
        setCurrentSong(state.currentSong);
        currentSongRef.current = state.currentSong;
        setQueue(state.queue);
        setUpNext(state.upNext);
        console.log('[tv] refreshState done', state.room.current_entry_id, state.queue.length, state.currentSong?.song?.title || 'no song');
      }
    } catch (err: any) {
      // Only set error if this is still the latest request
      if (requestId === requestIdRef.current) {
        console.error('Failed to refresh room state:', err);
        setError(err.message || 'Failed to refresh room state');
      }
    }
  }, []); // Empty deps - only uses stable setState functions and refs

  /**
   * Start polling room state
   * Polls refreshState every 2.5 seconds
   */
  const startPolling = useCallback((roomId: string) => {
    // Don't start if already polling
    if (pollingIntervalRef.current) {
      return;
    }
    
    console.log('[tv] Starting polling (2.5s interval)');
    pollingIntervalRef.current = setInterval(() => {
      const currentRoomId = roomIdRef.current;
      if (currentRoomId) {
        console.log('[tv] Polling refreshState');
        refreshState(currentRoomId);
      }
    }, 2500); // 2.5 seconds
  }, [refreshState]);

  const loadRoom = async (roomId: string) => {
    try {
      // Initial load
      await refreshState(roomId);
      localStorage.setItem('tv_room_id', roomId);
      roomIdRef.current = roomId;
      
      // Ensure host user ID is stored (if room was just created)
      const storedUserId = localStorage.getItem('tv_user_id');
      if (storedUserId) {
        setTvUserId(storedUserId);
      }
      
      // Register as primary TV if no primary exists (v4.3)
      const currentTvId = localStorage.getItem('tv_id');
      if (currentTvId) {
        try {
          const response = await fetch(`/api/rooms/${roomId}/register-tv`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tv_id: currentTvId }),
          });
          
          if (response.ok) {
            const data = await response.json();
            setIsPrimaryTV(data.is_primary);
            console.log('[tv] Registered as', data.is_primary ? 'PRIMARY' : 'SECONDARY', 'TV');
          }
        } catch (err) {
          console.error('[tv] Failed to register TV:', err);
          // Default to secondary if registration fails
          setIsPrimaryTV(false);
        }
      }
      
      // Start polling
      startPolling(roomId);
      
      setLoading(false);
    } catch (err: any) {
      setError(err.message || 'Failed to load room');
      setLoading(false);
    }
  };

  // Calculate if current TV session is the host
  const isHost = room && tvUserId && room.host_id === tvUserId;

  /**
   * Manual advance handler for "Play Next" button
   */
  const handleManualAdvance = async () => {
    if (!room) return;
    
    console.log('[tv] Manual advance triggered');
    try {
      await api.advancePlayback(room.id);
      console.log('[tv] /advance succeeded (manual)');
      // UI does NOTHING - waits for next poll (≤3s)
    } catch (err: any) {
      console.error('[tv] Failed to advance manually:', err);
      setError('Failed to skip to next song');
    }
  };

  /**
   * Handle video timeupdate event - stable callback for both addEventListener and onTimeUpdate prop
   * This ensures progress bar updates continuously (like fullscreen)
   */
  const handleTimeUpdate = useCallback(() => {
    const currentVideo = videoRef.current;
    if (currentVideo && isFinite(currentVideo.currentTime) && currentVideo.currentTime >= 0) {
      // Always update - this is what fullscreen uses
      setCurrentTime(currentVideo.currentTime);
    }
  }, []);

  /**
   * Handle playback error - advance to next song
   */
  const handlePlaybackError = useCallback(async () => {
    console.error('[tv] Playback error - advancing to next song');
    setError('Playback error - skipping to next song');
    
    const latestRoom = roomRef.current;
    if (latestRoom) {
      try {
        await api.advancePlayback(latestRoom.id);
        console.log('[tv] /advance succeeded after error');
        // Clear error after a short delay
        setTimeout(() => setError(''), 3000);
      } catch (err) {
        console.error('[tv] Failed to advance after error:', err);
      }
    }
  }, []);

  /**
   * Handle video ended event - stable callback for both addEventListener and onEnded prop
   */
  const handleEnded = useCallback(async () => {
    console.log('[tv] onEnded fired');
    
    // Prevent double-firing (both addEventListener and onEnded prop might fire)
    if (isAdvancingRef.current) {
      console.log('[tv] onEnded already processing, ignoring duplicate event');
      return;
    }
    
    // Use refs to get latest values (not closure values)
    const latestRoom = roomRef.current;
    const latestCurrentSong = currentSongRef.current;
    const playingQueueItemId = playingQueueItemIdRef.current;
    
    if (!latestRoom) {
      console.warn('[tv] onEnded fired but no room');
      return;
    }
    
    // CRITICAL: Verify that the ended video matches the DB's current song
    // This prevents marking wrong songs as completed when video element is out of sync
    if (latestCurrentSong && playingQueueItemId !== latestCurrentSong.id) {
      console.warn('[tv] onEnded fired but video element is playing different song:', {
        playingQueueItemId,
        currentSongId: latestCurrentSong.id,
        message: 'Ignoring onEnded - video element out of sync with DB'
      });
      return;
    }
    
    // Mark as processing to prevent double-firing
    isAdvancingRef.current = true;
    
    console.log('[tv] onEnded verified - calling /advance for room:', latestRoom.id, 'queue item:', playingQueueItemId);
    try {
      // Call /advance endpoint (atomic state transition)
      await api.advancePlayback(latestRoom.id);
      console.log('[tv] /advance succeeded');
      // Clear playing queue item ID and video src to force reload of next song
      playingQueueItemIdRef.current = null;
      currentVideoSrcRef.current = null;
      // Trigger immediate refresh to get new currentSong (don't wait for poll)
      // This ensures autoplay works immediately
      if (latestRoom.id) {
        await refreshState(latestRoom.id);
      }
    } catch (err: any) {
      console.error('[tv] Failed to advance playback:', err);
      setError('Failed to advance to next song');
    } finally {
      // Reset flag after a short delay to allow for state updates
      setTimeout(() => {
        isAdvancingRef.current = false;
      }, 500);
    }
  }, [refreshState]);

  /**
   * Video element handling
   * Reloads video when media_url changes (key={media_url} forces remount)
   * Must reload on currentSong.song.media_url change: key={media_url} + effect sets src, load(), play()
   * Prevents unnecessary reloads when the same URL is set repeatedly
   */
  useEffect(() => {
    if (!videoRef.current) {
      console.log('[tv] Video effect: no video ref');
      return;
    }
    if (!currentSong?.song?.media_url) {
      console.log('[tv] Video effect: no media_url');
      return;
    }

    const video = videoRef.current;
    const mediaUrl = currentSong.song.media_url;
    const queueItemId = currentSong.id;

    // Only reload if the URL OR queue item ID actually changed
    // This ensures we reload when a different queue item (even with same media_url) becomes current
    // Also reload if playingQueueItemIdRef is null (after advance, before new song starts)
    if (currentVideoSrcRef.current === mediaUrl && playingQueueItemIdRef.current === queueItemId && playingQueueItemIdRef.current !== null) {
      console.log('[tv] Video URL and queue item ID unchanged, skipping reload:', mediaUrl, queueItemId);
      return;
    }

    // Preserve current volume before reload (important for iOS)
    const currentVolume = video.volume;
    const wasMuted = video.muted;

    // Update tracked URL and queue item ID, then reload
    console.log('[tv] set video src:', mediaUrl, 'for queue item:', queueItemId);
    currentVideoSrcRef.current = mediaUrl;
    playingQueueItemIdRef.current = queueItemId;
    // Reset time tracking when new video loads
    setCurrentTime(0);
    setDuration(0);
    video.src = mediaUrl;
    
    // Restore volume BEFORE load() to prevent iOS from resetting it
    video.volume = currentVolume;
    video.muted = wasMuted;
    
    video.load();
    // Note: play() is called in handleLoadedData when video is ready

    const handleLoadedData = () => {
      const currentVideo = videoRef.current;
      if (!currentVideo) return;
      
      // Restore volume again after load (iOS sometimes resets it)
      currentVideo.volume = currentVolume;
      currentVideo.muted = wasMuted;
      
      console.log('[tv] Video loaded, attempting to play for queue item:', queueItemId, 'volume:', currentVolume, 'muted:', wasMuted);
      // After media_url change: set video.src, load(), attempt play()
      // Use setTimeout to ensure video is fully ready (fixes autoplay timing issue)
      setTimeout(() => {
        currentVideo.play().then(() => {
          console.log('[tv] Play() succeeded for queue item:', queueItemId);
          // Mark this queue item as the one actually playing
          playingQueueItemIdRef.current = queueItemId;
          // Final volume restore after playback starts (for iOS)
          currentVideo.volume = currentVolume;
          currentVideo.muted = wasMuted;
        }).catch((err: any) => {
          console.error('[tv] Failed to play video:', err);
          if (err.name === 'NotAllowedError') {
            // Autoplay blocked - show overlay requiring one click then retry play()
            console.log('[tv] Autoplay blocked - showing user interaction overlay');
            setNeedsUserInteraction(true);
            setHasUserInteracted(false);
          } else {
            setError(`Failed to play video: ${err.message}`);
            // On playback error, skip to next song
            if (room) {
              api.advancePlayback(room.id).catch(console.error);
            }
          }
        });
      }, 100); // Small delay to ensure video element is ready
    };

    const handlePlay = () => {
      const currentVideo = videoRef.current;
      if (!currentVideo) return;
      
      console.log('Video started playing');
      setIsPlaying(true);
      setNeedsUserInteraction(false);
      setError('');
      // Update current time immediately when play starts
      setCurrentTime(currentVideo.currentTime);
      // Ensure volume is still correct after play starts (iOS safeguard)
      currentVideo.volume = currentVolume;
      currentVideo.muted = wasMuted;
      // Hide controls after starting to play
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, 3000);
    };

    const handlePause = () => {
      const currentVideo = videoRef.current;
      if (!currentVideo) return;
      
      console.log('Video paused');
      setIsPlaying(false);
      // Update current time when paused
      setCurrentTime(currentVideo.currentTime);
    };

    // Use the stable handleEnded callback from useCallback
    // Also attach via onEnded prop for reliability (React manages this internally)
    // This ensures the event fires even if the element is remounted
    video.onended = handleEnded;

    const handleError = async (e: any) => {
      console.error('[tv] Video error:', e);
      setError('Video playback error - skipping to next song');
      
      // On error, advance to next song (treat as skip)
      const latestRoom = roomRef.current;
      if (latestRoom) {
        try {
          await api.advancePlayback(latestRoom.id);
          console.log('[tv] /advance succeeded after error');
          // UI does NOTHING - waits for next poll (≤3s)
        } catch (err) {
          console.error('[tv] Failed to advance after error:', err);
        }
      }
    };

    const handleLoadedMetadata = () => {
      const currentVideo = videoRef.current;
      if (currentVideo) {
        setDuration(currentVideo.duration);
      }
    };

    video.addEventListener('loadeddata', handleLoadedData);
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('ended', handleEnded);
    video.addEventListener('error', handleError);
    
    console.log('[tv] Video event listeners attached, currentSong:', currentSong?.id);

    // Set volume
    video.volume = volume;

    // Handle fullscreen changes
    const handleFullscreenChange = () => {
      setIsFullscreen(
        !!(document.fullscreenElement ||
          (document as any).webkitFullscreenElement ||
          (document as any).mozFullScreenElement)
      );
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);

    return () => {
      video.removeEventListener('loadeddata', handleLoadedData);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      // Note: onTimeUpdate prop is handled by React, no need to remove
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('ended', handleEnded);
      video.removeEventListener('error', handleError);
      // Clear onEnded prop handler
      video.onended = null;
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
    };
  }, [currentSong?.id, currentSong?.song?.media_url, room, volume, handleEnded, handleTimeUpdate]);

  // Mouse movement to show controls
  useEffect(() => {
    const handleMouseMove = () => {
      setShowControls(true);
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, 3000);
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <div>Loading room...</div>
      </div>
    );
  }

  if (error && !currentSong) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ color: '#e00' }}>{error}</div>
        <button onClick={() => room && loadRoom(room.id)}>Retry</button>
      </div>
    );
  }

  if (!room) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <div>Room not found</div>
      </div>
    );
  }

  // Check if current song is YouTube (v4.0)
  const isYouTubeSong = currentSong?.source_type === 'youtube' && currentSong?.youtube_url;
  
  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', background: '#000', overflow: 'hidden' }}>
      {/* Video Container - Full screen */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' }}>
        {/* YouTube Player (v4.0 Commercial Mode) */}
        {isYouTubeSong && currentSong?.youtube_url && (
          <YouTubePlayer
            key={currentSong.id}
            videoUrl={currentSong.youtube_url}
            onReady={() => {
              // Set playing queue item ID so handleEnded knows which song is playing
              playingQueueItemIdRef.current = currentSong.id;
              console.log('[TV] YouTube player ready, tracking queue item:', currentSong.id);
            }}
            onEnded={handleEnded}
            onError={(code) => {
              console.error('[TV] YouTube error:', code);
              handlePlaybackError();
            }}
            onTimeUpdate={(current, dur) => {
              setCurrentTime(current);
              if (dur && dur > 0) {
                setDuration(dur);
              }
            }}
            autoPlay={true}
            muted={!isPrimaryTV}
            width="100%"
            height="100%"
          />
        )}
        
        {/* HTML5 Video Player (v3.5 Database Mode) */}
        {!isYouTubeSong && (
          <video
            key={`${currentSong?.id || 'no-video'}-${currentSong?.song?.media_url || ''}`}
            ref={videoRef}
            autoPlay
            playsInline
            // onEnded is handled by both addEventListener AND onEnded prop for reliability
            onEnded={handleEnded}
            // onTimeUpdate as prop for reliability (like fullscreen)
            onTimeUpdate={handleTimeUpdate}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
            }}
          />
        )}

      {/* User Interaction Overlay (for autoplay) */}
      {needsUserInteraction && !hasUserInteracted && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.8)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 2000,
          }}
          onClick={async () => {
            if (videoRef.current) {
              try {
                console.log('[tv] User interaction - retrying play()');
                await videoRef.current.play();
                console.log('[tv] Play() succeeded after user interaction');
                setHasUserInteracted(true);
                setNeedsUserInteraction(false);
              } catch (err) {
                console.error('[tv] Failed to play after user interaction:', err);
              }
            }
          }}
        >
          <button
            style={{
              fontSize: '2rem',
              padding: '1rem 2rem',
              background: '#fff',
              color: '#000',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
            }}
          >
            ▶ Play
          </button>
        </div>
      )}

      {/* TV Mode Badge - Top Left (v4.3) */}
      {appConfig.commercialMode && (
        <div
          style={{
            position: 'absolute',
            top: '1rem',
            left: '1rem',
            background: isPrimaryTV 
              ? 'linear-gradient(135deg, rgba(0, 255, 0, 0.9), rgba(0, 200, 0, 0.9))'
              : 'linear-gradient(135deg, rgba(100, 100, 100, 0.9), rgba(60, 60, 60, 0.9))',
            color: 'white',
            padding: '0.5rem 1rem',
            borderRadius: '8px',
            fontSize: '0.9rem',
            fontWeight: 'bold',
            zIndex: 1100,
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          {isPrimaryTV ? '🔊 PRIMARY DISPLAY' : '📺 SECONDARY DISPLAY'}
        </div>
      )}

      {/* Song Title and User Name - Below badge */}
      {showControls && currentSong && !needsUserInteraction && (
        <div
          style={{
            position: 'absolute',
            top: appConfig.commercialMode ? '4rem' : '1rem',
            left: '1rem',
            background: 'linear-gradient(to bottom, rgba(0,0,0,0.7), transparent)',
            padding: '0.75rem 1rem',
            borderRadius: '8px',
            zIndex: 1000,
            maxWidth: 'calc(100% - 2rem)',
          }}
        >
          {currentSong && (
            <div style={{ color: 'white' }}>
              <div style={{ fontSize: '1.1rem', fontWeight: 'bold', lineHeight: '1.3', marginBottom: '0.25rem' }}>
                {currentSong.title || 'Unknown Song'}
              </div>
              <div style={{ fontSize: '0.9rem', opacity: 0.85 }}>
                {currentSong.user_name || 'Guest'}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Up Next Flying Banner - Scrolling marquee at top center (only shows in last 60 seconds) */}
      {upNext && currentSong && !needsUserInteraction && duration > 0 && currentTime > 0 && (duration - currentTime) <= 60 && (duration - currentTime) >= 0 && (
        <div
          style={{
            position: 'absolute',
            top: '1rem',
            left: 0,
            right: 0,
            overflow: 'hidden',
            zIndex: 900,
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              display: 'inline-block',
              whiteSpace: 'nowrap',
              animation: 'scrollLeft 15s linear infinite',
              paddingLeft: '100%',
            }}
          >
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '1rem',
                background: 'linear-gradient(135deg, rgba(0, 255, 0, 0.95) 0%, rgba(0, 200, 0, 0.95) 100%)',
                color: '#000',
                padding: '1rem 2rem',
                borderRadius: '50px',
                boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
                fontSize: '1.5rem',
                fontWeight: 'bold',
              }}
            >
              <span style={{ fontSize: '2rem' }}>🎵</span>
              <span style={{ textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: '900' }}>UP NEXT:</span>
              <span>{upNext.title || 'Unknown Song'}</span>
              <span style={{ fontSize: '1.8rem' }}>👤</span>
              <span>{upNext.user_name || 'Guest'}</span>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes scrollLeft {
          from {
            transform: translateX(0);
          }
          to {
            transform: translateX(-100%);
          }
        }
      `}</style>

      {/* Controls Overlay - YouTube style (v3.5 only, hidden for v4.0 YouTube mode) */}
      {showControls && currentSong && !needsUserInteraction && !isYouTubeSong && (
        <div
          style={{
            position: 'absolute',
            bottom: '10px',
            left: 0,
            right: 0,
            background: 'linear-gradient(to top, rgba(0,0,0,0.9), transparent)',
            padding: '0.75rem 1rem 0.75rem 1rem',
            zIndex: 1000,
            paddingBottom: '1rem',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Controls Row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
            {/* Play/Pause Button */}
            <button
              onClick={async () => {
                if (videoRef.current) {
                  const video = videoRef.current;
                  // Check actual video state, not just isPlaying state
                  if (video.paused) {
                    // Video is paused, play it
                    try {
                      await video.play();
                      setIsPlaying(true);
                    } catch (err) {
                      console.error('Failed to play:', err);
                    }
                  } else {
                    // Video is playing, pause it
                    video.pause();
                    setIsPlaying(false);
                  }
                }
              }}
              style={{
                fontSize: '1.5rem',
                width: '36px',
                height: '36px',
                background: 'transparent',
                color: 'white',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '50%',
                transition: 'background 0.2s',
                flexShrink: 0,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.2)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              {videoRef.current && !videoRef.current.paused ? '⏸' : '▶'}
            </button>

            {/* Play Next Button */}
            <button
              onClick={handleManualAdvance}
              disabled={!currentSong && queue.length === 0}
              style={{
                fontSize: '1rem',
                padding: '0.4rem 0.8rem',
                background: (currentSong || queue.length > 0) ? 'rgba(255,255,255,0.2)' : 'rgba(128,128,128,0.3)',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: (currentSong || queue.length > 0) ? 'pointer' : 'not-allowed',
                transition: 'all 0.2s',
                flexShrink: 0,
              }}
              onMouseEnter={(e) => {
                if (currentSong || queue.length > 0) {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)';
                }
              }}
              onMouseLeave={(e) => {
                if (currentSong || queue.length > 0) {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.2)';
                }
              }}
            >
              ⏭️ Next
            </button>

            {/* Volume Control */}
            <div
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}
              onMouseEnter={() => setShowVolumeSlider(true)}
              onMouseLeave={() => setShowVolumeSlider(false)}
            >
              <button
                onClick={() => {
                  if (videoRef.current) {
                    const newVolume = volume > 0 ? 0 : 1;
                    videoRef.current.volume = newVolume;
                    setVolume(newVolume);
                  }
                }}
                style={{
                  fontSize: '1.3rem',
                  background: 'transparent',
                  border: 'none',
                  color: 'white',
                  cursor: 'pointer',
                  padding: '0.25rem',
                  width: '36px',
                  height: '36px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {volume === 0 ? '🔇' : volume < 0.5 ? '🔉' : '🔊'}
              </button>
              {showVolumeSlider && (
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={volume}
                  onChange={(e) => {
                    const newVolume = parseFloat(e.target.value);
                    if (videoRef.current) {
                      videoRef.current.volume = newVolume;
                      setVolume(newVolume);
                    }
                  }}
                  style={{ width: '80px' }}
                />
              )}
            </div>

            {/* Time Duration Display - YouTube style on right */}
            {duration > 0 && (
              <div style={{ 
                color: 'white', 
                fontSize: '0.9rem', 
                opacity: 0.9, 
                whiteSpace: 'nowrap',
                fontFamily: 'monospace',
                marginLeft: 'auto',
                flexShrink: 0,
              }}>
                {formatTime(currentTime)} / {formatTime(duration)}
              </div>
            )}

            {/* Fullscreen Button */}
            <button
              onClick={async () => {
                try {
                  if (!isFullscreen) {
                    if (videoRef.current?.requestFullscreen) {
                      await videoRef.current.requestFullscreen();
                    } else if ((videoRef.current as any)?.webkitRequestFullscreen) {
                      await (videoRef.current as any).webkitRequestFullscreen();
                    } else if ((videoRef.current as any)?.mozRequestFullScreen) {
                      await (videoRef.current as any).mozRequestFullScreen();
                    }
                  } else {
                    if (document.exitFullscreen) {
                      await document.exitFullscreen();
                    } else if ((document as any).webkitExitFullscreen) {
                      await (document as any).webkitExitFullscreen();
                    } else if ((document as any).mozCancelFullScreen) {
                      await (document as any).mozCancelFullScreen();
                    }
                  }
                } catch (err) {
                  console.error('Failed to toggle fullscreen:', err);
                }
              }}
              style={{
                fontSize: '1.2rem',
                padding: '0.5rem',
                background: 'transparent',
                border: 'none',
                color: 'white',
                cursor: 'pointer',
                flexShrink: 0,
                width: '36px',
                height: '36px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {isFullscreen ? '⤓' : '⤢'}
            </button>
          </div>

          {/* Progress Bar - YouTube style below buttons */}
          {duration > 0 && (
            <div
              style={{
                width: '100%',
                height: '4px',
                cursor: 'pointer',
                position: 'relative',
                marginTop: '0.5rem',
              }}
              onClick={(e) => {
                if (videoRef.current && duration > 0) {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const clickX = e.clientX - rect.left;
                  const percentage = clickX / rect.width;
                  const newTime = percentage * duration;
                  videoRef.current.currentTime = newTime;
                  setCurrentTime(newTime);
                }
              }}
            >
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  background: 'rgba(255,255,255,0.2)',
                  borderRadius: '2px',
                  position: 'relative',
                }}
              >
                <div
                  style={{
                    width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%`,
                    height: '100%',
                    background: '#ff0000',
                    borderRadius: '2px',
                  }}
                />
                <div
                  style={{
                    position: 'absolute',
                    left: `${duration > 0 ? (currentTime / duration) * 100 : 0}%`,
                    top: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: '12px',
                    height: '12px',
                    background: '#ff0000',
                    borderRadius: '50%',
                    opacity: showControls ? 1 : 0,
                    transition: 'opacity 0.2s',
                    boxShadow: '0 0 4px rgba(0,0,0,0.5)',
                  }}
                />
              </div>
            </div>
          )}
        </div>
      )}
      </div>

      {/* Mobile Toggle Button - Only visible on mobile/tablet */}
      <button
        onClick={() => setShowSidebar(!showSidebar)}
        className="sidebar-toggle-btn"
        style={{
          position: 'absolute',
          top: '1rem',
          right: '1rem',
          zIndex: 600,
          background: 'rgba(0,0,0,0.8)',
          color: 'white',
          border: '2px solid rgba(255,255,255,0.3)',
          borderRadius: '8px',
          padding: '0.75rem',
          fontSize: '1.5rem',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minWidth: '48px',
          minHeight: '48px',
        }}
        title={showSidebar ? 'Hide Queue' : 'Show Queue & QR'}
      >
        {showSidebar ? '✕' : '☰'}
      </button>

      {/* Backdrop Overlay - Only visible on mobile when sidebar is open */}
      {showSidebar && (
        <div
          className="sidebar-backdrop"
          onClick={() => setShowSidebar(false)}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.5)',
            zIndex: 499,
          }}
        />
      )}

      {/* Queue Sidebar - Enhanced scrolling for TV browsers */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          width: '300px',
          maxHeight: '100vh',
          background: 'rgba(0,0,0,0.8)',
          color: 'white',
          padding: '1rem',
          overflowY: 'auto',
          overflowX: 'hidden',
          zIndex: 500,
          // Enhanced scrolling for TV browsers (FireTV, Smart TV)
          scrollBehavior: 'smooth',
          WebkitOverflowScrolling: 'touch', // iOS smooth scrolling
          // Better scrollbar visibility for TV browsers
          scrollbarWidth: 'thin', // Firefox
          scrollbarColor: 'rgba(255,255,255,0.5) rgba(0,0,0,0.3)', // Firefox
          // Webkit scrollbar styling (Chrome, Safari, Smart TV browsers)
          // Note: These are pseudo-elements, so we'll add them via CSS class
        }}
        className={`tv-queue-scroll queue-sidebar ${showSidebar ? 'sidebar-open' : 'sidebar-closed'}`}
      >
        {/* QR Code - Positioned at top of queue sidebar, outside video area */}
        {room && (
          <div
            style={{
              background: 'rgba(255,255,255,0.95)',
              padding: '0.5rem',
              borderRadius: '8px',
              marginBottom: '1rem',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              boxSizing: 'border-box',
              boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
            }}
          >
            <div style={{ fontSize: '0.7rem', marginBottom: '0.3rem', fontWeight: 'bold', textAlign: 'center', color: '#333', width: '100%' }}>
              {room.room_code}
            </div>
            <div style={{ width: '100%', padding: '0.2rem', boxSizing: 'border-box', display: 'flex', justifyContent: 'center', alignItems: 'center', background: 'white', borderRadius: '4px' }}>
              <QRCode url={getQRCodeUrl(room.room_code)} size={80} />
            </div>
            <div style={{ fontSize: '0.6rem', marginTop: '0.3rem', color: '#666', textAlign: 'center', width: '100%' }}>
              Scan to join
            </div>
          </div>
        )}
        
        <div style={{ fontSize: '1.2rem', fontWeight: 'bold', marginBottom: '1rem', position: 'sticky', top: 0, background: 'rgba(0,0,0,0.8)', paddingBottom: '0.5rem', zIndex: 10 }}>
          Queue ({queue.length})
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', paddingBottom: '1rem' }}>
          {queue.slice(0, 3).map((item) => (
            <div
              key={item.id}
              style={{
                padding: '0.75rem',
                background: 'rgba(255,255,255,0.1)',
                borderRadius: '4px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'start',
                gap: '0.5rem',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.8rem', opacity: 0.7, marginBottom: '0.25rem' }}>
                  #{item.position}
                </div>
                <div style={{ fontWeight: 'normal', wordBreak: 'break-word' }}>
                  {item.title || 'Unknown'}
                </div>
                <div style={{ fontSize: '0.85rem', opacity: 0.8 }}>
                  {item.user_name || 'Guest'}
                </div>
              </div>
              {isHost && item.status === 'pending' && (
                <div style={{ display: 'flex', gap: '0.25rem', flexShrink: 0, flexDirection: 'column' }}>
                  {/* Reorder buttons */}
                  <button
                    onClick={async () => {
                      if (room) {
                        try {
                          const currentPos = item.position;
                          const newPos = Math.max(1, currentPos - 1);
                          if (newPos !== currentPos) {
                            await api.reorderQueue(item.id, newPos, room.id);
                            await refreshState(room.id);
                          }
                        } catch (err: any) {
                          console.error('[tv] Failed to move up:', err);
                          setError(err.message || 'Failed to move up');
                        }
                      }
                    }}
                    disabled={item.position === 1}
                    style={{
                      padding: '0.25rem 0.5rem',
                      background: item.position === 1 ? 'rgba(128,128,128,0.3)' : 'rgba(0,123,255,0.8)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      fontSize: '0.9rem',
                      fontWeight: 'bold',
                      cursor: item.position === 1 ? 'not-allowed' : 'pointer',
                      opacity: item.position === 1 ? 0.5 : 1,
                      minWidth: '30px',
                    }}
                    title="Move up"
                  >
                    ↑
                  </button>
                  <button
                    onClick={async () => {
                      if (room) {
                        try {
                          const currentPos = item.position;
                          const maxPos = queue.length;
                          const newPos = Math.min(maxPos, currentPos + 1);
                          if (newPos !== currentPos) {
                            await api.reorderQueue(item.id, newPos, room.id);
                            await refreshState(room.id);
                          }
                        } catch (err: any) {
                          console.error('[tv] Failed to move down:', err);
                          setError(err.message || 'Failed to move down');
                        }
                      }
                    }}
                    disabled={item.position === queue.length}
                    style={{
                      padding: '0.25rem 0.5rem',
                      background: item.position === queue.length ? 'rgba(128,128,128,0.3)' : 'rgba(0,123,255,0.8)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      fontSize: '0.9rem',
                      fontWeight: 'bold',
                      cursor: item.position === queue.length ? 'not-allowed' : 'pointer',
                      opacity: item.position === queue.length ? 0.5 : 1,
                      minWidth: '30px',
                    }}
                    title="Move down"
                  >
                    ↓
                  </button>
                  {/* Remove button */}
                  <button
                    onClick={async () => {
                      if (room && tvUserId) {
                        try {
                          await api.removeFromQueue(item.id, room.id, tvUserId);
                          await refreshState(room.id);
                        } catch (err: any) {
                          console.error('[tv] Failed to remove:', err);
                          setError(err.message || 'Failed to remove from queue');
                        }
                      }
                    }}
                    style={{
                      padding: '0.25rem 0.5rem',
                      background: 'rgba(255,107,107,0.8)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      fontSize: '0.75rem',
                      cursor: 'pointer',
                      marginTop: '0.25rem',
                    }}
                    title="Remove"
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>
          ))}
          {queue.length === 0 && !currentSong && (
            <div style={{ textAlign: 'center', padding: '2rem', opacity: 0.6 }}>
              Queue is empty
            </div>
          )}
        </div>
      </div>


      {/* Start Playing Button - centered overlay when queue has songs but nothing playing */}
      {!currentSong && queue.length > 0 && (
        <button
          onClick={async () => {
            if (room) {
              try {
                await api.advancePlayback(room.id);
                console.log('[tv] Manual start triggered');
              } catch (err) {
                console.error('[tv] Failed to start playback:', err);
              }
            }
          }}
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            padding: '2rem 3rem',
            background: 'rgba(0, 255, 0, 0.3)',
            border: '3px solid #00ff00',
            borderRadius: '16px',
            color: 'white',
            fontSize: '2rem',
            cursor: 'pointer',
            fontWeight: 'bold',
            zIndex: 1000,
            boxShadow: '0 8px 32px rgba(0, 255, 0, 0.3)',
            backdropFilter: 'blur(10px)',
            transition: 'all 0.3s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(0, 255, 0, 0.5)';
            e.currentTarget.style.transform = 'translate(-50%, -50%) scale(1.05)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(0, 255, 0, 0.3)';
            e.currentTarget.style.transform = 'translate(-50%, -50%) scale(1)';
          }}
        >
          ▶️ Start Playing
        </button>
      )}

      {/* Error Display */}
      {error && currentSong && (
        <div
          style={{
            position: 'absolute',
            top: '1rem',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(255,0,0,0.9)',
            color: 'white',
            padding: '1rem',
            borderRadius: '8px',
            zIndex: 2000,
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}

export default function TVModePage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <TVModePageContent />
    </Suspense>
  );
}
