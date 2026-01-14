'use client';

import { useEffect, useState, useRef, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import type { ReorderQueueRequest } from '@/shared/types';
import { getQRCodeUrl } from '@/lib/utils';
import QRCode from '@/components/QRCode';
import type { Room, QueueItem } from '@/shared/types';

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
  
  const [room, setRoom] = useState<Room | null>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [currentSong, setCurrentSong] = useState<QueueItem | null>(null);
  const [upNext, setUpNext] = useState<QueueItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tvUserId, setTvUserId] = useState<string | null>(null); // Host user ID from localStorage
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [needsUserInteraction, setNeedsUserInteraction] = useState(false);
  const [hasUserInteracted, setHasUserInteracted] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [volume, setVolume] = useState(1);
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);
  
  // Prevent stale refresh overwrites
  const requestIdRef = useRef<number>(0);
  const roomIdRef = useRef<string | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const currentVideoSrcRef = useRef<string | null>(null);
  const currentSongRef = useRef<QueueItem | null>(null);
  const roomRef = useRef<Room | null>(null);

  // Load room from localStorage or URL - setup polling
  useEffect(() => {
    const storedRoomId = localStorage.getItem('tv_room_id');
    const storedUserId = localStorage.getItem('tv_user_id'); // Host user ID
    const roomId = roomIdParam || storedRoomId;

    if (!roomId) {
      setError('No room ID found. Please create a room first.');
      setLoading(false);
      return;
    }

    // Load host user ID
    if (storedUserId) {
      setTvUserId(storedUserId);
      console.log('[tv] Loaded host user ID from localStorage:', storedUserId);
    }

    // Cleanup previous polling if roomId changed
    if (pollingIntervalRef.current && roomIdRef.current !== roomId) {
      console.log('[tv] Room ID changed, cleaning up previous polling');
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }

    loadRoom(roomId);
    
    // Cleanup on unmount or roomId change
    return () => {
      console.log('[tv] Cleanup effect running for roomId:', roomId);
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [roomIdParam]);

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
   * On mobile: Immediately fetches new state and plays video in user interaction context
   */
  const handleManualAdvance = async () => {
    if (!room) return;
    
    console.log('[tv] Manual advance triggered');
    try {
      // Advance playback first
      await api.advancePlayback(room.id);
      console.log('[tv] /advance succeeded (manual)');
      
      // Immediately refresh state to get the new currentSong
      // Then try to play in the same interaction context (mobile-friendly)
      const state = await api.getRoomState(room.id);
      if (state.currentSong?.song?.media_url && videoRef.current) {
        // Update state immediately
        setCurrentSong(state.currentSong);
        setQueue(state.queue);
        setUpNext(state.upNext);
        
        // Set video source and play immediately (still in user interaction context)
        videoRef.current.src = state.currentSong.song.media_url;
        videoRef.current.load();
        try {
          await videoRef.current.play();
          console.log('[tv] Video play() succeeded immediately after advance (mobile-friendly)');
          currentVideoSrcRef.current = state.currentSong.song.media_url;
        } catch (playErr: any) {
          console.error('[tv] Failed to play immediately after advance:', playErr);
          if (playErr.name === 'NotAllowedError') {
            setNeedsUserInteraction(true);
            setHasUserInteracted(false);
          }
          // Video will retry on next poll or user interaction
        }
      } else {
        // No next song - just wait for poll
        console.log('[tv] No next song after advance, waiting for poll');
      }
    } catch (err: any) {
      console.error('[tv] Failed to advance manually:', err);
      setError('Failed to skip to next song');
    }
  };

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

    // Only reload if the URL actually changed
    if (currentVideoSrcRef.current === mediaUrl) {
      console.log('[tv] Video URL unchanged, skipping reload:', mediaUrl);
      return;
    }

    // Update tracked URL and reload
    console.log('[tv] set video src:', mediaUrl);
    currentVideoSrcRef.current = mediaUrl;
    video.src = mediaUrl;
    video.load();

    const handleLoadedData = () => {
      console.log('[tv] Video loaded, attempting to play');
      // After media_url change: set video.src, load(), attempt play()
      video.play().then(() => {
        console.log('[tv] Play() succeeded');
        // If autoplay succeeded, mark as interacted (enables future autoplay)
        // This happens after first user interaction
        if (hasUserInteracted) {
          // Already interacted - autoplay is working
        } else {
          // This shouldn't happen (autoplay should be blocked), but just in case
          setHasUserInteracted(true);
        }
      }).catch((err: any) => {
        console.error('[tv] Failed to play video:', err);
        if (err.name === 'NotAllowedError') {
          // Autoplay blocked - show overlay requiring one click then retry play()
          console.log('[tv] Autoplay blocked - showing user interaction overlay');
          setNeedsUserInteraction(true);
          setHasUserInteracted(false);
        } else {
          // Only auto-advance on actual playback errors (network, codec, etc.)
          // Not on autoplay restrictions (those are handled above)
          console.error('[tv] Video playback error (non-autoplay):', err);
          setError(`Failed to play video: ${err.message}`);
          // On actual playback error (not autoplay), skip to next song
          // But only if it's a real error (network, codec, 404, etc.)
          if (room && err.name !== 'NotAllowedError') {
            console.log('[tv] Auto-advancing due to playback error');
            api.advancePlayback(room.id).catch(console.error);
          }
        }
      });
    };

    const handlePlay = () => {
      console.log('Video started playing');
      setIsPlaying(true);
      setNeedsUserInteraction(false);
      setHasUserInteracted(true); // Mark that user has interacted - enables autoplay for next songs
      setError('');
      // Hide controls after starting to play
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, 3000);
    };

    const handlePause = () => {
      console.log('Video paused');
      setIsPlaying(false);
    };

    const handleEnded = async () => {
      console.log('[tv] onEnded fired');
      // Use refs to get latest values (not closure values)
      const latestRoom = roomRef.current;
      
      if (!latestRoom) {
        console.warn('[tv] onEnded fired but no room');
        return;
      }
      
      console.log('[tv] Calling /advance for room:', latestRoom.id);
      try {
        // Call /advance endpoint (atomic state transition)
        await api.advancePlayback(latestRoom.id);
        console.log('[tv] /advance succeeded');
        
        // Mobile-friendly: Immediately fetch new state and play next song
        // This keeps the play() call in the video event context (better for mobile autoplay)
        // Video 'ended' event is considered user interaction context for autoplay
        if (videoRef.current) {
          try {
            console.log('[tv] Immediately fetching next song for autoplay (in video event context)');
            const state = await api.getRoomState(latestRoom.id);
            
            if (state.currentSong?.song?.media_url) {
              // Update state immediately
              setCurrentSong(state.currentSong);
              setQueue(state.queue);
              setUpNext(state.upNext);
              
              // Set video source and play immediately (still in video event context)
              // This should work on mobile because we're in a media event handler
              videoRef.current.src = state.currentSong.song.media_url;
              videoRef.current.load();
              
              try {
                await videoRef.current.play();
                console.log('[tv] Next song autoplay succeeded after ended event');
                currentVideoSrcRef.current = state.currentSong.song.media_url;
                setHasUserInteracted(true); // Mark interaction for future songs
              } catch (playErr: any) {
                console.error('[tv] Failed to autoplay next song:', playErr);
                if (playErr.name === 'NotAllowedError') {
                  // Autoplay still blocked - show overlay
                  // This can happen on very strict mobile browsers
                  console.log('[tv] Autoplay blocked even in event context - showing overlay');
                  setNeedsUserInteraction(true);
                  // Don't reset hasUserInteracted - user already interacted once
                }
              }
            } else {
              // No next song - just wait for poll
              console.log('[tv] No next song after advance, waiting for poll');
            }
          } catch (stateErr: any) {
            console.error('[tv] Failed to fetch state after advance:', stateErr);
            // Fall back to polling
          }
        }
      } catch (err: any) {
        console.error('[tv] Failed to advance playback:', err);
        setError('Failed to advance to next song');
      }
    };
    
    // Store handleEnded in a way that can be called from both addEventListener and onEnded prop
    const handleEndedWrapper = () => {
      handleEnded();
    };

    const handleError = async (e: any) => {
      console.error('[tv] Video error:', e);
      const error = e.target?.error;
      
      // Check error type - only auto-advance on certain errors
      if (error) {
        const errorCode = error.code;
        const errorMessage = error.message || 'Unknown error';
        
        console.error('[tv] Video error details:', { code: errorCode, message: errorMessage });
        
        // Error codes:
        // 1 = MEDIA_ERR_ABORTED (user aborted)
        // 2 = MEDIA_ERR_NETWORK (network error)
        // 3 = MEDIA_ERR_DECODE (decode error)
        // 4 = MEDIA_ERR_SRC_NOT_SUPPORTED (format not supported)
        
        // Only auto-advance on network/decode/source errors (not user abort)
        if (errorCode === 2 || errorCode === 3 || errorCode === 4) {
          setError(`Video playback error (${errorMessage}) - skipping to next song`);
          
          // On actual playback error, advance to next song
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
        } else if (errorCode === 1) {
          // User aborted - don't auto-advance, just show message
          console.log('[tv] Video playback aborted by user');
          setError('Playback stopped');
        } else {
          // Unknown error - show but don't auto-advance (let user decide)
          setError(`Video error: ${errorMessage}`);
        }
      } else {
        // No error details - show generic message
        setError('Video playback error occurred');
      }
    };

    video.addEventListener('loadeddata', handleLoadedData);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('ended', handleEndedWrapper);
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
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('ended', handleEnded);
      video.removeEventListener('error', handleError);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
    };
  }, [currentSong?.song?.media_url, room, volume]);

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

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', background: '#000', overflow: 'hidden' }}>
      {/* Video Container - Full screen */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' }}>
        {/* Video Player - key={media_url} forces remount on URL change */}
        <video
          key={currentSong?.song?.media_url || 'no-video'}
          ref={videoRef}
          autoPlay
          playsInline
          onEnded={async () => {
            console.log('[tv] Video onEnded prop fired');
            // Backup handler - the addEventListener in useEffect is primary
            const latestRoom = roomRef.current;
            console.log('[tv] onEnded prop fired for room:', latestRoom?.id);
            if (latestRoom) {
              try {
                await api.advancePlayback(latestRoom.id);
                console.log('[tv] /advance succeeded (from onEnded prop)');
                // UI does NOTHING - waits for next poll (≤3s)
              } catch (err: any) {
                console.error('[tv] Failed to advance (from prop):', err);
              }
            }
          }}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
          }}
        />

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

      {/* Controls Overlay */}
      {showControls && currentSong && !needsUserInteraction && (
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            background: 'linear-gradient(to top, rgba(0,0,0,0.9), transparent)',
            padding: '1rem 1.5rem',
            zIndex: 1000,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Top Controls Row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.75rem' }}>
            {/* Play/Pause Button */}
            <button
              onClick={() => {
                if (videoRef.current) {
                  if (isPlaying) {
                    videoRef.current.pause();
                  } else {
                    videoRef.current.play().then(() => {
                      setHasUserInteracted(true); // Mark interaction for autoplay
                    }).catch((err) => {
                      console.error('Failed to play:', err);
                    });
                  }
                }
              }}
              style={{
                fontSize: '1.5rem',
                width: '40px',
                height: '40px',
                background: 'transparent',
                color: 'white',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '50%',
                transition: 'background 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.2)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              {isPlaying ? '⏸' : '▶'}
            </button>

            {/* Play Next Button - Moved from song info area */}
            <button
              onClick={handleManualAdvance}
              disabled={!currentSong && queue.length === 0}
              style={{
                fontSize: '1.2rem',
                padding: '0.5rem 1rem',
                background: (currentSong || queue.length > 0) ? 'rgba(255,255,255,0.2)' : 'rgba(128,128,128,0.3)',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: (currentSong || queue.length > 0) ? 'pointer' : 'not-allowed',
                transition: 'all 0.2s',
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
              ⏭️ Play Next
            </button>

            {/* Volume Control */}
            <div
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
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
                  fontSize: '1.5rem',
                  background: 'transparent',
                  border: 'none',
                  color: 'white',
                  cursor: 'pointer',
                  padding: '0.25rem',
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
                  style={{ width: '100px' }}
                />
              )}
            </div>

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
              }}
            >
              {isFullscreen ? '⤓' : '⤢'}
            </button>
          </div>

          {/* Song Info */}
          {currentSong && (
            <div style={{ color: 'white' }}>
              <div style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>
                {currentSong.song?.title || 'Unknown Song'}
              </div>
              {currentSong.user && (
                <div style={{ fontSize: '0.9rem', opacity: 0.8 }}>
                  {currentSong.user.display_name || 'Guest'}
                </div>
              )}
            </div>
          )}
        </div>
      )}
      </div>

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
        className="tv-queue-scroll"
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
                  {item.song?.title || 'Unknown'}
                </div>
                {item.user && (
                  <div style={{ fontSize: '0.85rem', opacity: 0.8 }}>
                    {item.user.display_name || 'Guest'}
                  </div>
                )}
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
                      if (room) {
                        try {
                          await api.removeFromQueue(item.id, room.id);
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
          
          {/* Start Playing Button - shows when queue has songs but nothing playing */}
          {!currentSong && queue.length > 0 && (
            <button
              onClick={async () => {
                if (room) {
                  try {
                    // Advance playback first
                    await api.advancePlayback(room.id);
                    console.log('[tv] Manual start triggered');
                    
                    // Immediately refresh state to get the new currentSong
                    // Then try to play in the same interaction context
                    const state = await api.getRoomState(room.id);
                    if (state.currentSong?.song?.media_url && videoRef.current) {
                      // Set video source and play immediately (still in user interaction context)
                      videoRef.current.src = state.currentSong.song.media_url;
                      videoRef.current.load();
                      try {
                        await videoRef.current.play();
                        console.log('[tv] Video play() succeeded immediately (mobile-friendly)');
                        setCurrentSong(state.currentSong); // Update state
                      } catch (playErr: any) {
                        console.error('[tv] Failed to play immediately:', playErr);
                        if (playErr.name === 'NotAllowedError') {
                          setNeedsUserInteraction(true);
                          setHasUserInteracted(false);
                        }
                        // Still update state - video will retry on next poll
                        setCurrentSong(state.currentSong);
                      }
                    }
                  } catch (err) {
                    console.error('[tv] Failed to start playback:', err);
                    setError('Failed to start playback. Please try again.');
                  }
                }
              }}
              style={{
                margin: '1rem auto',
                padding: '1rem 2rem',
                background: 'rgba(0, 255, 0, 0.3)',
                border: '2px solid #00ff00',
                borderRadius: '12px',
                color: 'white',
                fontSize: '1.2rem',
                cursor: 'pointer',
                display: 'block',
                fontWeight: 'bold'
              }}
            >
              ▶️ Start Playing
            </button>
          )}
        </div>
      </div>


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
