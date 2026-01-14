'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { getOrCreateFingerprint } from '@/lib/utils';
import { api } from '@/lib/api';

export default function HomePage() {
  const router = useRouter();
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

