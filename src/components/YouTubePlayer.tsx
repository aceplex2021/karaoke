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
import { isAndroid } from '@/lib/utils';

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
   * @param event - YouTube API event object (event.target is the player instance)
   */
  onReady?: (event?: any) => void;
  
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
  
  /**
   * Mute audio (default: false) - v4.3 for secondary TVs
   */
  muted?: boolean;
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
  muted = false,
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

    // Android: Ensure container is visible before initialization
    if (isAndroid() && containerRef.current) {
      const container = containerRef.current;
      const rect = container.getBoundingClientRect();
      
      // Force container to be visible for Android
      if (rect.width === 0 || rect.height === 0) {
        console.log('[YouTubePlayer] Container not visible yet on Android, forcing visibility...');
        container.style.display = 'block';
        container.style.visibility = 'visible';
        container.style.opacity = '1';
        container.style.position = 'relative';
        container.style.width = '100%';
        container.style.height = '100%';
        container.style.minWidth = '320px';
        container.style.minHeight = '180px';
        
        // Force reflow
        container.offsetHeight;
        
        // Wait a bit longer for Android to register the container
        setTimeout(() => {
          const newRect = container.getBoundingClientRect();
          if (newRect.width === 0 || newRect.height === 0) {
            console.warn('[YouTubePlayer] Container still not visible after forcing, retrying...');
            setTimeout(initPlayer, 200);
            return;
          }
          initPlayer();
        }, 300);
        return;
      }
      
      // Log container state for debugging
      console.log('[YouTubePlayer] Android container verified:', {
        width: rect.width,
        height: rect.height,
        top: rect.top,
        left: rect.left,
        origin: window.location.origin,
        href: window.location.href
      });
    }

    console.log('[YouTubePlayer] Initializing player for video:', videoId);

    // Build player vars
    const playerVars: any = {
      autoplay: autoPlay ? 1 : 0,
      controls: controls ? 1 : 0,
      modestbranding: 1,
      rel: 0,
      fs: 1,
      playsinline: 1,
      enablejsapi: 1,
    };

    // Android: Add origin parameter (required for PWA/embedded playback)
    if (isAndroid() && typeof window !== 'undefined') {
      const origin = window.location.origin;
      playerVars.origin = origin;
      playerVars.widget_referrer = origin;
      // Additional Android-specific parameters to help with embedding
      playerVars.iv_load_policy = 3; // Hide annotations to reduce bot detection
      playerVars.cc_load_policy = 0; // Disable captions by default
      // Try to prevent YouTube from blocking embedding
      playerVars.disablekb = 0; // Enable keyboard controls (might help with detection)
      playerVars.loop = 0; // Don't loop (some videos block looping)
      console.log('[YouTubePlayer] Android detected - added origin:', origin, 'full URL:', window.location.href);
      
      // Also try setting document referrer (though this might not work in PWA)
      try {
        if (document.referrer === '' && window.location.origin) {
          // If no referrer, we can't set it, but log it
          console.log('[YouTubePlayer] Document referrer:', document.referrer || 'empty (expected for direct navigation)');
        }
      } catch (e) {
        // Ignore errors accessing document.referrer
      }
    }

    // Android: Ensure container is in DOM and visible before creating player
    if (isAndroid() && containerRef.current) {
      // Force container to be in viewport
      containerRef.current.scrollIntoView({ behavior: 'auto', block: 'nearest' });
    }
    
    playerRef.current = new YT.Player(containerRef.current, {
      videoId: videoId,
      width: '100%',
      height: '100%',
      playerVars,
      events: {
        onReady: handleReady,
        onStateChange: handleStateChange,
        onError: handleError,
      },
    });
    
    // Android: Immediately try to access and configure iframe (before onReady)
    if (isAndroid() && containerRef.current) {
      // Use MutationObserver to catch iframe when it's created
      const observer = new MutationObserver((mutations) => {
        // Check both container and document for iframe (YouTube might create it elsewhere)
        let iframe = containerRef.current?.querySelector('iframe') as HTMLIFrameElement;
        if (!iframe) {
          // Try finding iframe by src containing youtube.com
          if (videoId) {
            const allIframes = document.querySelectorAll('iframe');
            for (let i = 0; i < allIframes.length; i++) {
              const testIframe = allIframes[i] as HTMLIFrameElement;
              if (testIframe.src && testIframe.src.includes('youtube.com') && testIframe.src.includes(videoId)) {
                iframe = testIframe;
                break;
              }
            }
          }
        }
        
        if (iframe && !iframe.hasAttribute('data-android-configured')) {
          iframe.setAttribute('data-android-configured', 'true');
          iframe.setAttribute('referrerpolicy', 'no-referrer-when-downgrade');
          iframe.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture');
          console.log('[YouTubePlayer] Android iframe configured via MutationObserver:', {
            found: true,
            src: iframe.src.substring(0, 80) + '...',
            referrerpolicy: iframe.getAttribute('referrerpolicy')
          });
          observer.disconnect();
        }
      });
      
      observer.observe(containerRef.current, {
        childList: true,
        subtree: true
      });
      
      // Also observe document body in case iframe is created there
      if (document.body) {
        observer.observe(document.body, {
          childList: true,
          subtree: true
        });
      }
      
      // Try multiple times with increasing delays (iframe might be created asynchronously)
      const tryConfigureIframe = (attempt: number, maxAttempts: number = 10) => {
        if (attempt > maxAttempts) {
          observer.disconnect();
          return;
        }
        
        setTimeout(() => {
          let iframe = containerRef.current?.querySelector('iframe') as HTMLIFrameElement;
          if (!iframe && videoId) {
            // Try finding iframe by src containing youtube.com
            const allIframes = document.querySelectorAll('iframe');
            for (let i = 0; i < allIframes.length; i++) {
              const testIframe = allIframes[i] as HTMLIFrameElement;
              if (testIframe.src && testIframe.src.includes('youtube.com') && testIframe.src.includes(videoId)) {
                iframe = testIframe;
                break;
              }
            }
          }
          
          if (iframe && !iframe.hasAttribute('data-android-configured')) {
            iframe.setAttribute('data-android-configured', 'true');
            iframe.setAttribute('referrerpolicy', 'no-referrer-when-downgrade');
            iframe.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture');
            console.log(`[YouTubePlayer] Android iframe configured via setTimeout (attempt ${attempt}):`, {
              found: true,
              src: iframe.src.substring(0, 80) + '...',
              referrerpolicy: iframe.getAttribute('referrerpolicy')
            });
            observer.disconnect();
          } else if (!iframe) {
            // Iframe not found yet, try again
            tryConfigureIframe(attempt + 1, maxAttempts);
          }
        }, attempt * 50); // 50ms, 100ms, 150ms, etc.
      };
      
      tryConfigureIframe(1);
    }
  };

  const handleReady = (event: any) => {
    console.log('[YouTubePlayer] Player ready');
    setIsReady(true);
    
    // Android: Access iframe after creation and set referrer policy
    if (isAndroid() && containerRef.current) {
      // The YouTube API creates an iframe - try multiple locations
      let iframe = containerRef.current.querySelector('iframe') as HTMLIFrameElement;
      
      // If not in container, search entire document for YouTube iframe with this video
      if (!iframe && videoId) {
        const allIframes = document.querySelectorAll('iframe');
        for (let i = 0; i < allIframes.length; i++) {
          const testIframe = allIframes[i] as HTMLIFrameElement;
          if (testIframe.src && testIframe.src.includes('youtube.com') && testIframe.src.includes(videoId)) {
            iframe = testIframe;
            console.log('[YouTubePlayer] Found iframe outside container, using it');
            break;
          }
        }
      }
      
      if (iframe) {
        // Use default referrer policy (no-referrer-when-downgrade) so YouTube gets full referrer
        iframe.setAttribute('referrerpolicy', 'no-referrer-when-downgrade');
        iframe.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture');
        iframe.setAttribute('allowfullscreen', 'true');
        
        console.log('[YouTubePlayer] Android iframe attributes set in handleReady:', {
          referrerpolicy: iframe.getAttribute('referrerpolicy'),
          allow: iframe.getAttribute('allow'),
          src: iframe.src.substring(0, 100) + '...' // Log first 100 chars of src
        });
      } else {
        console.warn('[YouTubePlayer] Android iframe not found in container or document, will retry...');
        // Retry after a short delay - iframe might be created asynchronously
        setTimeout(() => {
          let retryIframe = containerRef.current?.querySelector('iframe') as HTMLIFrameElement;
          if (!retryIframe && videoId) {
            const allIframes = document.querySelectorAll('iframe');
            for (let i = 0; i < allIframes.length; i++) {
              const testIframe = allIframes[i] as HTMLIFrameElement;
              if (testIframe.src && testIframe.src.includes('youtube.com') && testIframe.src.includes(videoId)) {
                retryIframe = testIframe;
                break;
              }
            }
          }
          
          if (retryIframe) {
            retryIframe.setAttribute('referrerpolicy', 'no-referrer-when-downgrade');
            retryIframe.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture');
            console.log('[YouTubePlayer] Android iframe found and configured on retry');
          } else {
            console.error('[YouTubePlayer] Android iframe still not found after retry');
          }
        }, 200);
      }
    }
    
    // Mute if secondary TV (v4.3)
    if (muted && event.target) {
      event.target.mute();
      console.log('[YouTubePlayer] Muted (secondary TV)');
    }
    
    if (onReady) {
      // Pass event object so caller can access player instance via event.target
      onReady(event);
    }

    // Start time update interval
    intervalRef.current = setInterval(() => {
      if (playerRef.current && typeof playerRef.current.getCurrentTime === 'function') {
        const currentTime = playerRef.current.getCurrentTime();
        const duration = playerRef.current.getDuration();
        
        // Always call onTimeUpdate even if currentTime or duration is 0
        // This ensures the TV page always has accurate values
        if (onTimeUpdate && typeof currentTime === 'number' && typeof duration === 'number') {
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
