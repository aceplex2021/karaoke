'use client';

import { useState, useRef, useEffect } from 'react';
import type { VersionSearchResult } from '@/shared/types';

interface VersionCardProps {
  version: VersionSearchResult;
  onAddToQueue: (versionId: string) => void;
  isActive?: boolean; // For preview active state
  onPreviewStart?: (versionId: string) => void; // Notify parent
  onPreviewStop?: () => void; // Notify parent
}

export function VersionCard({ version, onAddToQueue, isActive = false, onPreviewStart, onPreviewStop }: VersionCardProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopPreview();
    };
  }, []);

  // Stop preview if another card becomes active
  useEffect(() => {
    if (!isActive && isPlaying) {
      stopPreview();
    }
  }, [isActive, isPlaying]);

  const startPreview = async () => {
    if (!videoRef.current || !version.play_url) return;

    const video = videoRef.current;
    
    try {
      setLoading(true);
      setError(false);
      
      // Detect iOS (iPhone/iPad)
      const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
      
      console.log('[VersionCard] Starting preview, isIOS:', isIOS);
      
      // Set video source
      video.src = version.play_url;
      
      // CRITICAL iOS requirements - set BEFORE any async operations
      video.muted = true;
      video.volume = 0;
      video.playsInline = true; // Property in addition to attribute
      
      // CRITICAL: Call play() IMMEDIATELY while still in user gesture context
      // iOS will reject play() if called after any await/Promise
      const playPromise = video.play();
      
      console.log('[VersionCard] play() called immediately in gesture handler');
      
      // Now handle the async parts AFTER play() was initiated
      playPromise.catch((err) => {
        console.error('[VersionCard] Initial play() rejected:', err);
        throw err;
      });
      
      // Wait for metadata (but play() already called)
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Metadata load timeout')), 10000);
        video.onloadedmetadata = () => {
          clearTimeout(timeout);
          resolve(true);
        };
        video.onerror = (e) => {
          clearTimeout(timeout);
          reject(e);
        };
      });
      
      console.log('[VersionCard] Metadata loaded, duration:', video.duration);
      
      // Wait for video to start playing
      await new Promise((resolve) => {
        const timeout = setTimeout(resolve, 1000);
        const checkPlaying = () => {
          if (!video.paused && video.readyState >= 2) {
            clearTimeout(timeout);
            resolve(true);
          }
        };
        video.oncanplay = checkPlaying;
        video.onplaying = checkPlaying;
        checkPlaying();
      });
      
      console.log('[VersionCard] Video playing, seeking to preview position');
      
      // Seek to preview position (30s mark)
      const seekTime = Math.min(30, (video.duration || 30) - 10);
      video.currentTime = seekTime;
      
      // Wait for seek
      await new Promise((resolve) => {
        const timeout = setTimeout(resolve, 500);
        video.onseeked = () => {
          clearTimeout(timeout);
          resolve(true);
        };
      });
      
      console.log('[VersionCard] Seek complete, unmuting');
      
      // Unmute after everything is stable
      video.muted = false;
      video.volume = 0.5;
      
      console.log('[VersionCard] Preview playing successfully');
      setIsPlaying(true);
      setLoading(false);
      
      // Notify parent that this preview is active
      onPreviewStart?.(version.version_id);

      // Auto-stop after 10 seconds
      timeoutRef.current = setTimeout(() => {
        stopPreview();
      }, 10000);
    } catch (err) {
      console.error('[VersionCard] Preview failed:', err);
      setError(true);
      setLoading(false);
      setIsPlaying(false);
    }
  };

  const stopPreview = () => {
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
      videoRef.current.src = '';
    }
    
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    
    setIsPlaying(false);
    setLoading(false);
    
    // Notify parent that preview stopped
    onPreviewStop?.();
  };

  const handleAddToQueue = () => {
    stopPreview(); // Stop preview if playing
    onAddToQueue(version.version_id);
  };

  const handlePreviewClick = () => {
    if (isPlaying) {
      stopPreview();
    } else {
      startPreview();
    }
  };

  // Format duration MM:SS
  const formatDuration = (seconds: number | null): string => {
    if (!seconds) return '';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${String(secs).padStart(2, '0')}`;
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        background: '#fff',
        borderRadius: '12px',
        overflow: 'hidden',
        boxShadow: isActive ? '0 4px 16px rgba(33, 150, 243, 0.3)' : '0 2px 8px rgba(0,0,0,0.1)',
        transition: 'all 0.2s ease',
        border: isActive ? '2px solid #2196F3' : '1px solid #e0e0e0',
      }}
    >
      {/* Video Preview (visible during playback) */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          paddingBottom: '56.25%', // 16:9 aspect ratio
          backgroundColor: '#000',
          overflow: 'hidden',
          display: isPlaying ? 'block' : 'none',
        }}
      >
        <video
          ref={videoRef}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            objectFit: 'contain',
          }}
          preload="metadata"
          playsInline
        />
      </div>

      {/* Card Content */}
      <div style={{ padding: '16px' }}>
        {/* Title */}
        <h3
          style={{
            fontSize: '1rem',
            fontWeight: '600',
            margin: '0 0 8px 0',
            lineHeight: '1.4',
            color: '#0f0f0f',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {version.song_title}
        </h3>

        {/* Artist */}
        {version.artist_name && (
          <div
            style={{
              fontSize: '0.875rem',
              color: '#606060',
              marginBottom: '12px',
              display: '-webkit-box',
              WebkitLineClamp: 1,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {version.artist_name}
          </div>
        )}

        {/* Metadata Badges */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }}>
          {/* Tone */}
          {version.tone && (
            <span
              style={{
                fontSize: '0.75rem',
                padding: '4px 10px',
                background: version.tone.toLowerCase() === 'nam' ? '#E3F2FD' : '#FCE4EC',
                color: version.tone.toLowerCase() === 'nam' ? '#1976D2' : '#C2185B',
                borderRadius: '16px',
                fontWeight: '600',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              {version.tone.toLowerCase() === 'nam' ? '👨 Male' : '👩 Female'}
            </span>
          )}

          {/* Mixer/Channel */}
          {version.mixer && (
            <span
              style={{
                fontSize: '0.75rem',
                padding: '4px 10px',
                background: '#F5F5F5',
                color: '#424242',
                borderRadius: '16px',
                fontWeight: '500',
              }}
            >
              🎤 {version.mixer}
            </span>
          )}

          {/* Style */}
          {version.style && (
            <span
              style={{
                fontSize: '0.75rem',
                padding: '4px 10px',
                background: '#FFF3E0',
                color: '#E65100',
                borderRadius: '16px',
                fontWeight: '500',
              }}
            >
              🎵 {version.style.toUpperCase()}
            </span>
          )}

          {/* Duration */}
          {version.duration_seconds && (
            <span
              style={{
                fontSize: '0.75rem',
                padding: '4px 10px',
                background: '#EDE7F6',
                color: '#512DA8',
                borderRadius: '16px',
                fontWeight: '500',
              }}
            >
              ⏱️ {formatDuration(version.duration_seconds)}
            </span>
          )}
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '8px' }}>
          {/* Preview Button */}
          <button
            onClick={handlePreviewClick}
            disabled={loading || error}
            style={{
              flex: 1,
              padding: '12px',
              background: isPlaying ? '#FF5252' : (loading ? '#BDBDBD' : '#2196F3'),
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontWeight: '600',
              fontSize: '0.875rem',
              cursor: loading ? 'wait' : (error ? 'not-allowed' : 'pointer'),
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              transition: 'all 0.2s',
              opacity: error ? 0.5 : 1,
            }}
          >
            {loading ? '⏳ Loading...' : isPlaying ? '⏸️ Stop' : '▶️ Preview'}
          </button>

          {/* Add to Queue Button */}
          <button
            onClick={handleAddToQueue}
            style={{
              flex: 1,
              padding: '12px',
              background: 'linear-gradient(135deg, #4CAF50 0%, #45A049 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontWeight: '600',
              fontSize: '0.875rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              transition: 'all 0.2s',
            }}
          >
            ➕ Add to Queue
          </button>
        </div>

        {/* Error State */}
        {error && (
          <div
            style={{
              marginTop: '8px',
              padding: '8px',
              background: '#FFEBEE',
              color: '#C62828',
              borderRadius: '6px',
              fontSize: '0.75rem',
              textAlign: 'center',
            }}
          >
            Preview failed. Try adding to queue instead.
          </div>
        )}
      </div>
    </div>
  );
}
