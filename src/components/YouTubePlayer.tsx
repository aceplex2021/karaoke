/**
 * YouTube Player Component
 * 
 * Wrapper around YouTube Iframe API with event handling
 * Used in TV mode for commercial/YouTube playback
 * 
 * Features:
 * - Auto-play videos
 * - Event callbacks (onEnded, onError, onReady, onStateChange)
 * - Progress tracking
 * - Error handling
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import { extractYouTubeId } from '@/lib/youtube';

// YouTube Player State (from API)
enum YTPlayerState {
  UNSTARTED = -1,
  ENDED = 0,
  PLAYING = 1,
  PAUSED = 2,
  BUFFERING = 3,
  CUED = 5,
}

interface YouTubePlayerProps {
  /**
   * YouTube video URL or video ID
   */
  videoUrl: string;
  
  /**
   * Called when video ends
   */
  onEnded?: () => void;
  
  /**
   * Called when video encounters an error
   */
  onError?: (error: number) => void;
  
  /**
   * Called when player is ready
   */
  onReady?: () => void;
  
  /**
   * Called on state change
   */
  onStateChange?: (state: number) => void;
  
  /**
   * Called on time update (progress)
   */
  onTimeUpdate?: (currentTime: number, duration: number) => void;
  
  /**
   * Auto-play on load (default: true)
   */
  autoPlay?: boolean;
  
  /**
   * Player width (default: 100%)
   */
  width?: string | number;
  
  /**
   * Player height (default: 100%)
   */
  height?: string | number;
  
  /**
   * Player controls (default: true)
   */
  controls?: boolean;
}

export function YouTubePlayer({
  videoUrl,
  onEnded,
  onError,
  onReady,
  onStateChange,
  onTimeUpdate,
  autoPlay = true,
  width = '100%',
  height = '100%',
  controls = true,
}: YouTubePlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Extract video ID
  const videoId = extractYouTubeId(videoUrl);

  // Load YouTube Iframe API
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Check if API already loaded
    if ((window as any).YT && (window as any).YT.Player) {
      console.log('[YouTubePlayer] API already loaded');
      initPlayer();
      return;
    }

    // Load API script
    console.log('[YouTubePlayer] Loading YouTube Iframe API');
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    const firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);

    // API ready callback
    (window as any).onYouTubeIframeAPIReady = () => {
      console.log('[YouTubePlayer] API loaded and ready');
      initPlayer();
    };

    return () => {
      // Cleanup
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  // Reinitialize player when video changes
  useEffect(() => {
    if (isReady && playerRef.current && videoId) {
      console.log('[YouTubePlayer] Loading new video:', videoId);
      playerRef.current.loadVideoById(videoId);
    }
  }, [videoId, isReady]);

  const initPlayer = () => {
    if (!containerRef.current || !videoId) return;
    if (playerRef.current) return; // Already initialized

    const YT = (window as any).YT;
    if (!YT || !YT.Player) {
      console.error('[YouTubePlayer] YouTube API not available');
      return;
    }

    console.log('[YouTubePlayer] Initializing player for video:', videoId);

    playerRef.current = new YT.Player(containerRef.current, {
      videoId: videoId,
      width: '100%',
      height: '100%',
      playerVars: {
        autoplay: autoPlay ? 1 : 0,
        controls: controls ? 1 : 0,
        modestbranding: 1,
        rel: 0,
        fs: 1,
        playsinline: 1,
        enablejsapi: 1,
      },
      events: {
        onReady: handleReady,
        onStateChange: handleStateChange,
        onError: handleError,
      },
    });
  };

  const handleReady = (event: any) => {
    console.log('[YouTubePlayer] Player ready');
    setIsReady(true);
    
    if (onReady) {
      onReady();
    }

    // Start time update interval
    intervalRef.current = setInterval(() => {
      if (playerRef.current && typeof playerRef.current.getCurrentTime === 'function') {
        const currentTime = playerRef.current.getCurrentTime();
        const duration = playerRef.current.getDuration();
        
        if (onTimeUpdate && currentTime && duration) {
          onTimeUpdate(currentTime, duration);
        }
      }
    }, 500); // Update every 500ms
  };

  const handleStateChange = (event: any) => {
    const state = event.data;
    console.log('[YouTubePlayer] State changed:', state);

    if (onStateChange) {
      onStateChange(state);
    }

    // Handle ended
    if (state === YTPlayerState.ENDED) {
      console.log('[YouTubePlayer] Video ended');
      if (onEnded) {
        onEnded();
      }
    }
  };

  const handleError = (event: any) => {
    const errorCode = event.data;
    console.error('[YouTubePlayer] Error:', errorCode);

    let errorMessage = 'Unknown error';
    switch (errorCode) {
      case 2:
        errorMessage = 'Invalid video ID';
        break;
      case 5:
        errorMessage = 'HTML5 player error';
        break;
      case 100:
        errorMessage = 'Video not found or deleted';
        break;
      case 101:
      case 150:
        errorMessage = 'Video not allowed to be played in embedded players';
        break;
    }

    setError(errorMessage);

    if (onError) {
      onError(errorCode);
    }
  };

  // Show error message
  if (error) {
    return (
      <div style={{
        width,
        height,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#000',
        color: '#fff',
        flexDirection: 'column',
        padding: '2rem',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚠️</div>
        <h3 style={{ marginBottom: '0.5rem' }}>Playback Error</h3>
        <p style={{ color: '#ccc' }}>{error}</p>
        <p style={{ color: '#999', fontSize: '0.9rem', marginTop: '1rem' }}>
          Skipping to next video...
        </p>
      </div>
    );
  }

  // Show loading state
  if (!videoId) {
    return (
      <div style={{
        width,
        height,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#000',
        color: '#fff',
      }}>
        <p>Invalid video URL</p>
      </div>
    );
  }

  return (
    <div 
      style={{ 
        width, 
        height,
        position: 'relative',
        background: '#000',
      }}
    >
      <div 
        ref={containerRef}
        style={{ 
          width: '100%', 
          height: '100%',
        }}
      />
    </div>
  );
}

/**
 * Hook to control YouTube player
 */
export function useYouTubePlayer(playerRef: React.RefObject<any>) {
  const play = () => {
    if (playerRef.current && typeof playerRef.current.playVideo === 'function') {
      playerRef.current.playVideo();
    }
  };

  const pause = () => {
    if (playerRef.current && typeof playerRef.current.pauseVideo === 'function') {
      playerRef.current.pauseVideo();
    }
  };

  const stop = () => {
    if (playerRef.current && typeof playerRef.current.stopVideo === 'function') {
      playerRef.current.stopVideo();
    }
  };

  const seekTo = (seconds: number) => {
    if (playerRef.current && typeof playerRef.current.seekTo === 'function') {
      playerRef.current.seekTo(seconds, true);
    }
  };

  const getCurrentTime = (): number => {
    if (playerRef.current && typeof playerRef.current.getCurrentTime === 'function') {
      return playerRef.current.getCurrentTime();
    }
    return 0;
  };

  const getDuration = (): number => {
    if (playerRef.current && typeof playerRef.current.getDuration === 'function') {
      return playerRef.current.getDuration();
    }
    return 0;
  };

  return {
    play,
    pause,
    stop,
    seekTo,
    getCurrentTime,
    getDuration,
  };
}
