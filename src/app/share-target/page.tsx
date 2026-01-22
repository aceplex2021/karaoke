/**
 * Share Target Page
 * 
 * Handles incoming shares from YouTube via PWA Share Target API
 * 
 * Flow:
 * 1. User shares YouTube video from YouTube app/browser
 * 2. "Kara" appears in share menu
 * 3. User selects Kara
 * 4. This page receives the shared URL
 * 5. Extract YouTube video ID
 * 6. Add to queue
 * 7. Redirect to room
 */

'use client';

import { Suspense, useEffect, useState, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { extractYouTubeId, isValidYouTubeUrl } from '@/lib/youtube';

// Force dynamic rendering for useSearchParams
export const dynamic = 'force-dynamic';

function ShareTargetContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
  const [message, setMessage] = useState('Processing shared video...');
  const hasProcessedRef = useRef(false);

  useEffect(() => {
    // Prevent duplicate processing (React 18 Strict Mode calls useEffect twice)
    if (hasProcessedRef.current) {
      console.log('[ShareTarget] Already processed, skipping');
      return;
    }
    hasProcessedRef.current = true;
    handleShare();
  }, []);

  const handleShare = async () => {
    try {
      // Get shared data from URL params
      const title = searchParams.get('title') || '';
      const text = searchParams.get('text') || '';
      const url = searchParams.get('url') || '';

      console.log('[ShareTarget] Received:', { title, text, url });

      // Try to extract YouTube URL from any of the fields
      const youtubeUrl = url || text;
      
      if (!youtubeUrl) {
        throw new Error('No URL provided');
      }

      // Validate YouTube URL
      if (!isValidYouTubeUrl(youtubeUrl)) {
        throw new Error('Not a valid YouTube URL');
      }

      // Extract video ID
      const videoId = extractYouTubeId(youtubeUrl);
      if (!videoId) {
        throw new Error('Could not extract video ID');
      }

      console.log('[ShareTarget] YouTube video ID:', videoId);

      // Get current room from localStorage
      const roomId = localStorage.getItem('current_room_id');
      const userId = localStorage.getItem('user_id');

      if (!roomId || !userId) {
        // No active room - redirect to join page with video ID
        setMessage('No active room. Redirecting to join page...');
        setTimeout(() => {
          router.push(`/join?youtubeId=${videoId}`);
        }, 1500);
        return;
      }

      // Add to queue
      setMessage('Adding to queue...');
      
      const response = await fetch('/api/queue/add-youtube', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          room_id: roomId,
          user_id: userId,
          youtube_url: youtubeUrl,
          title: title || '', // Empty string will trigger API to fetch title
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to add to queue');
      }

      // Success!
      setStatus('success');
      setMessage('✅ Added to queue!');

      // Redirect back to room
      setTimeout(() => {
        // Get room code from storage or API
        const roomCode = localStorage.getItem('current_room_code');
        if (roomCode) {
          router.push(`/room/${roomCode}`);
        } else {
          router.push('/');
        }
      }, 1500);

    } catch (error: any) {
      console.error('[ShareTarget] Error:', error);
      setStatus('error');
      setMessage(`❌ ${error.message || 'Failed to process share'}`);

      // Redirect to home after error
      setTimeout(() => {
        router.push('/');
      }, 3000);
    }
  };

  return (
    <div style={{ 
      minHeight: '100vh', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center',
      padding: '2rem',
      background: status === 'error' 
        ? 'linear-gradient(135deg, #e74c3c 0%, #c0392b 100%)'
        : status === 'success'
        ? 'linear-gradient(135deg, #2ecc71 0%, #27ae60 100%)'
        : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
    }}>
      <div className="card" style={{ maxWidth: '400px', width: '100%', textAlign: 'center' }}>
        {/* Icon */}
        <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>
          {status === 'processing' && '⏳'}
          {status === 'success' && '✅'}
          {status === 'error' && '❌'}
        </div>

        {/* Message */}
        <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>
          {message}
        </h2>

        {/* Loading spinner */}
        {status === 'processing' && (
          <div style={{ 
            width: '40px', 
            height: '40px', 
            border: '4px solid #f3f3f3',
            borderTop: '4px solid #667eea',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '1rem auto'
          }} />
        )}

        {/* Instructions */}
        <p style={{ color: '#666', fontSize: '0.9rem', marginTop: '1rem' }}>
          {status === 'processing' && 'Please wait...'}
          {status === 'success' && 'Redirecting to room...'}
          {status === 'error' && 'Redirecting to home...'}
        </p>
      </div>

      {/* CSS for spinner animation */}
      <style jsx>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

export default function ShareTargetPage() {
  return (
    <Suspense fallback={
      <div style={{ 
        minHeight: '100vh', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center' 
      }}>
        <div>Loading...</div>
      </div>
    }>
      <ShareTargetContent />
    </Suspense>
  );
}
