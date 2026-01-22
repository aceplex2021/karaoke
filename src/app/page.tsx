'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { getOrCreateFingerprint } from '@/lib/utils';
import { api } from '@/lib/api';
import { CommercialOnly, PrivateOnly } from '@/components/FeatureToggle';

export default function HomePage() {
  const router = useRouter();
  
  return (
    <>
      {/* v4.0 Commercial Mode - Simple 3-button interface */}
      <CommercialOnly>
        <V4LandingPage router={router} />
      </CommercialOnly>

      {/* v3.5 Private Mode - Original room creation interface */}
      <PrivateOnly>
        <V3LandingPage router={router} />
      </PrivateOnly>
    </>
  );
}

/**
 * v4.0 Landing Page (Commercial Mode)
 * Simple 3-button interface for Host, TV, and User
 */
function V4LandingPage({ router }: { router: ReturnType<typeof useRouter> }) {
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
        <h1 style={{ 
          fontSize: '2.5rem', 
          marginBottom: '0.5rem', 
          textAlign: 'center',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          fontWeight: 'bold'
        }}>
          🎤 Kara
        </h1>
        
        <p style={{ 
          textAlign: 'center', 
          color: '#666', 
          marginBottom: '2rem',
          fontSize: '0.95rem'
        }}>
          YouTube Karaoke Queue Manager
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <button
            className="btn btn-primary"
            onClick={() => router.push('/create')}
            style={{ 
              width: '100%',
              padding: '1.5rem',
              fontSize: '1.1rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.75rem'
            }}
          >
            <span style={{ fontSize: '1.5rem' }}>🎤</span>
            <span>Create Room (Host)</span>
          </button>

          <button
            className="btn btn-secondary"
            onClick={() => router.push('/tv-setup')}
            style={{ 
              width: '100%',
              padding: '1.5rem',
              fontSize: '1.1rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.75rem'
            }}
          >
            <span style={{ fontSize: '1.5rem' }}>📺</span>
            <span>I'm a TV / Media Player</span>
          </button>

          <button
            className="btn btn-secondary"
            onClick={() => router.push('/join')}
            style={{ 
              width: '100%',
              padding: '1.5rem',
              fontSize: '1.1rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.75rem'
            }}
          >
            <span style={{ fontSize: '1.5rem' }}>👥</span>
            <span>Join Room (User)</span>
          </button>
        </div>

        <div style={{ 
          marginTop: '2rem', 
          paddingTop: '2rem', 
          borderTop: '1px solid #eee', 
          fontSize: '0.85rem', 
          color: '#666',
          textAlign: 'center'
        }}>
          <p style={{ marginBottom: '0.5rem' }}>
            <strong>Host:</strong> Create and manage your karaoke party
          </p>
          <p style={{ marginBottom: '0.5rem' }}>
            <strong>TV:</strong> Display and play YouTube videos
          </p>
          <p>
            <strong>User:</strong> Join with room code and add songs
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * v3.5 Landing Page (Private Mode)
 * Original room creation interface with database mode
 */
function V3LandingPage({ router }: { router: ReturnType<typeof useRouter> }) {
  const [roomName, setRoomName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [queueMode, setQueueMode] = useState<'round_robin' | 'fifo'>('fifo');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleCreateRoom = async () => {
    if (!roomName.trim()) {
      setError('Room name is required');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const fingerprint = getOrCreateFingerprint();
      const { room } = await api.createRoom({
        room_name: roomName,
        host_fingerprint: fingerprint,
        host_display_name: displayName || 'Host',
        queue_mode: queueMode,
      });

      // Store room ID in localStorage for persistence (client-side only)
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem('tv_room_id', room.id);
        window.localStorage.setItem('tv_user_id', room.host_id || '');
      }

      router.push(`/tv?roomId=${room.id}`);
    } catch (err: any) {
      setError(err.message || 'Failed to create room');
    } finally {
      setLoading(false);
    }
  };

  const handleJoinRoom = () => {
    const code = prompt('Enter room code:');
    if (code) {
      router.push(`/room/${code.toUpperCase()}`);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
      <div className="card" style={{ maxWidth: '500px', width: '100%' }}>
        <h1 style={{ fontSize: '2rem', marginBottom: '1.5rem', textAlign: 'center' }}>
          🎤 Karaoke Web App
        </h1>

        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>
            Room Name
          </label>
          <input
            type="text"
            className="input"
            placeholder="My Party Room"
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleCreateRoom()}
          />
        </div>

        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>
            Your Name (optional)
          </label>
          <input
            type="text"
            className="input"
            placeholder="Host"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleCreateRoom()}
          />
        </div>

        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', marginBottom: '0.75rem', fontWeight: 600 }}>
            Queue Ordering Mode
          </label>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <label 
              style={{ 
                display: 'flex', 
                alignItems: 'flex-start', 
                cursor: 'pointer', 
                padding: '0.75rem', 
                border: '1px solid #ddd', 
                borderRadius: '4px', 
                backgroundColor: queueMode === 'fifo' ? '#f0f8ff' : 'transparent',
                transition: 'background-color 0.2s'
              }}
            >
              <input
                type="radio"
                name="queueMode"
                value="fifo"
                checked={queueMode === 'fifo'}
                onChange={(e) => setQueueMode(e.target.value as 'fifo')}
                style={{ marginRight: '0.5rem', marginTop: '0.2rem', cursor: 'pointer' }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>
                  First Come First Serve
                </div>
                <div style={{ fontSize: '0.85rem', color: '#666' }}>
                  Songs play in the order they were added. Simple and straightforward.
                </div>
              </div>
            </label>
            
            <label 
              style={{ 
                display: 'flex', 
                alignItems: 'flex-start', 
                cursor: 'pointer', 
                padding: '0.75rem', 
                border: '1px solid #ddd', 
                borderRadius: '4px', 
                backgroundColor: queueMode === 'round_robin' ? '#f0f8ff' : 'transparent',
                transition: 'background-color 0.2s'
              }}
            >
              <input
                type="radio"
                name="queueMode"
                value="round_robin"
                checked={queueMode === 'round_robin'}
                onChange={(e) => setQueueMode(e.target.value as 'round_robin')}
                style={{ marginRight: '0.5rem', marginTop: '0.2rem', cursor: 'pointer' }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>
                  Round Robin (Fair Rotation)
                </div>
                <div style={{ fontSize: '0.85rem', color: '#666' }}>
                  Each person gets one turn before anyone sings again. Ensures everyone gets equal opportunities.
                </div>
              </div>
            </label>
          </div>
        </div>

        {error && (
          <div style={{ color: '#e00', marginBottom: '1rem', fontSize: '0.9rem' }}>
            {error}
          </div>
        )}

        <button
          className="btn btn-primary"
          onClick={handleCreateRoom}
          disabled={loading}
          style={{ width: '100%', marginBottom: '1rem' }}
        >
          {loading ? 'Creating...' : 'Create Room (TV Mode)'}
        </button>

        <div style={{ textAlign: 'center', margin: '1.5rem 0', color: '#666' }}>
          OR
        </div>

        <button
          className="btn btn-secondary"
          onClick={handleJoinRoom}
          style={{ width: '100%' }}
        >
          Join Room (Phone Mode)
        </button>

        <div style={{ marginTop: '2rem', paddingTop: '2rem', borderTop: '1px solid #eee', fontSize: '0.9rem', color: '#666' }}>
          <p style={{ marginBottom: '0.5rem' }}>
            <strong>TV Mode:</strong> Create a room to display on your TV. The room persists across sessions.
          </p>
          <p>
            <strong>Phone Mode:</strong> Join a room using the room code to search and queue songs.
          </p>
        </div>
      </div>
    </div>
  );
}

