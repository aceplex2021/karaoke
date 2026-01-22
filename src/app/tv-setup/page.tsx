/**
 * TV Setup Page
 * 
 * TV/Media Player enters room code to join as a display device
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function TVSetupPage() {
  const router = useRouter();
  const [roomCode, setRoomCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleJoin = () => {
    if (!roomCode.trim()) {
      setError('Room code is required');
      return;
    }

    // Store TV role in localStorage
    if (typeof window !== 'undefined') {
      localStorage.setItem('user_role', 'tv');
    }

    // Navigate to TV page with room code
    router.push(`/tv?code=${roomCode.toUpperCase()}`);
  };

  return (
    <div style={{ 
      minHeight: '100vh', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center', 
      padding: '2rem',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
    }}>
      <div className="card" style={{ maxWidth: '600px', width: '100%' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <h1 style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>
            📺 TV / Media Player Setup
          </h1>
          <p style={{ color: '#666', fontSize: '1rem' }}>
            Enter the room code to start displaying videos
          </p>
        </div>

        {/* Instructions */}
        <div style={{
          background: '#f8f9fa',
          border: '1px solid #e9ecef',
          borderRadius: '8px',
          padding: '1.5rem',
          marginBottom: '2rem',
        }}>
          <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', fontWeight: 600 }}>
            Setup Instructions:
          </h3>
          <ol style={{ marginLeft: '1.5rem', color: '#666' }}>
            <li style={{ marginBottom: '0.75rem' }}>
              Have the host create a room first
            </li>
            <li style={{ marginBottom: '0.75rem' }}>
              Get the room code from the host
            </li>
            <li style={{ marginBottom: '0.75rem' }}>
              Enter the code below
            </li>
            <li>
              This TV will display videos and the queue
            </li>
          </ol>
        </div>

        {/* Room Code */}
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, fontSize: '1.1rem' }}>
            Room Code
          </label>
          <input
            type="text"
            className="input"
            placeholder="ABC123"
            value={roomCode}
            onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
            onKeyPress={(e) => e.key === 'Enter' && handleJoin()}
            autoFocus
            maxLength={6}
            style={{ 
              textTransform: 'uppercase', 
              fontSize: '2rem', 
              textAlign: 'center',
              padding: '1.5rem',
              letterSpacing: '0.5rem'
            }}
          />
        </div>

        {/* Error */}
        {error && (
          <div style={{ color: '#e00', marginBottom: '1rem', fontSize: '1rem', textAlign: 'center' }}>
            {error}
          </div>
        )}

        {/* Connect Button */}
        <button
          className="btn btn-primary"
          onClick={handleJoin}
          disabled={loading}
          style={{ width: '100%', marginBottom: '1rem', padding: '1.5rem', fontSize: '1.3rem' }}
        >
          {loading ? 'Connecting...' : '📺 Connect TV'}
        </button>

        {/* Back Button */}
        <button
          className="btn btn-secondary"
          onClick={() => router.push('/')}
          disabled={loading}
          style={{ width: '100%', fontSize: '1.1rem' }}
        >
          ← Back
        </button>

        {/* Note */}
        <div style={{ 
          marginTop: '2rem', 
          paddingTop: '2rem', 
          borderTop: '1px solid #eee', 
          fontSize: '0.9rem', 
          color: '#666',
          textAlign: 'center'
        }}>
          <p style={{ marginBottom: '0.5rem' }}>
            💡 <strong>Tip:</strong> Use this browser in fullscreen mode (F11) for best experience
          </p>
          <p style={{ color: '#999', fontSize: '0.85rem' }}>
            Multiple TVs can connect to the same room
          </p>
        </div>
      </div>
    </div>
  );
}
