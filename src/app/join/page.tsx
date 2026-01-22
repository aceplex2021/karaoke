/**
 * Join Room Page (User)
 * 
 * User enters room code and name to join
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function JoinRoomPage() {
  const router = useRouter();
  const [roomCode, setRoomCode] = useState('');
  const [userName, setUserName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleJoin = () => {
    if (!roomCode.trim()) {
      setError('Room code is required');
      return;
    }

    if (!userName.trim()) {
      setError('Your name is required');
      return;
    }

    // Store name in localStorage
    if (typeof window !== 'undefined') {
      localStorage.setItem('user_name', userName);
    }

    // Navigate to room
    router.push(`/room/${roomCode.toUpperCase()}`);
  };

  return (
    <div style={{ 
      minHeight: '100vh', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center', 
      padding: '1rem',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
    }}>
      <div className="card" style={{ maxWidth: '500px', width: '100%', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>
            👥 Join Room
          </h1>
          <p style={{ color: '#666', fontSize: '0.95rem' }}>
            Enter room code to join the party
          </p>
        </div>

        {/* Room Code */}
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>
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
            style={{ textTransform: 'uppercase', fontSize: '1.2rem', textAlign: 'center' }}
          />
          <p style={{ fontSize: '0.85rem', color: '#666', marginTop: '0.5rem' }}>
            Ask the host for the room code
          </p>
        </div>

        {/* User Name */}
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>
            Your Name
          </label>
          <input
            type="text"
            className="input"
            placeholder="Enter your name"
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleJoin()}
          />
        </div>

        {/* Error */}
        {error && (
          <div style={{ color: '#e00', marginBottom: '1rem', fontSize: '0.9rem' }}>
            {error}
          </div>
        )}

        {/* Join Button */}
        <button
          className="btn btn-primary"
          onClick={handleJoin}
          disabled={loading}
          style={{ width: '100%', marginBottom: '1rem', padding: '1rem', fontSize: '1.1rem' }}
        >
          {loading ? 'Joining...' : '🎤 Join Room'}
        </button>

        {/* Back Button */}
        <button
          className="btn btn-secondary"
          onClick={() => router.push('/')}
          disabled={loading}
          style={{ width: '100%' }}
        >
          ← Back
        </button>

        {/* Help Text */}
        <div style={{ 
          marginTop: '2rem', 
          paddingTop: '2rem', 
          borderTop: '1px solid #eee', 
          fontSize: '0.85rem', 
          color: '#666',
          textAlign: 'center'
        }}>
          <p>
            💡 The host will show you a QR code or room code to join
          </p>
        </div>
      </div>
    </div>
  );
}
