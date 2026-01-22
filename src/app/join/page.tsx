/**
 * Join Room Page (User)
 * 
 * User enters room code and name to join
 */

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

export default function JoinRoomPage() {
  const router = useRouter();
  const [roomCode, setRoomCode] = useState('');
  const [userName, setUserName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [checkingRoom, setCheckingRoom] = useState(true); // v4.5.1: Check for existing room

  // v4.5.1: Auto-rejoin last room if still active
  useEffect(() => {
    const checkLastRoom = async () => {
      try {
        const storedRoomCode = localStorage.getItem('current_room_code');
        const storedUserName = localStorage.getItem('user_display_name');
        const storedUserId = localStorage.getItem('user_id');
        
        if (!storedRoomCode || !storedUserName || !storedUserId) {
          console.log('[Join] No stored room - showing join form');
          setCheckingRoom(false);
          return;
        }
        
        console.log('[Join] Checking if last room is still active:', storedRoomCode);
        
        // Verify room still exists
        const roomData = await api.getRoomByCode(storedRoomCode);
        
        if (roomData && roomData.room) {
          console.log('[Join] ✅ Last room still active - auto-rejoining:', storedRoomCode);
          // Auto-redirect to last room
          router.push(`/room/${storedRoomCode}`);
          return;
        } else {
          console.log('[Join] Last room not found or expired - showing join form');
          // Clear stale data
          localStorage.removeItem('current_room_code');
          localStorage.removeItem('current_room_id');
          setCheckingRoom(false);
        }
      } catch (error) {
        console.error('[Join] Error checking last room:', error);
        // Clear stale data on error
        localStorage.removeItem('current_room_code');
        localStorage.removeItem('current_room_id');
        setCheckingRoom(false);
      }
    };
    
    checkLastRoom();
  }, [router]);

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
  
  // v4.5.1: Show loading while checking for last room
  if (checkingRoom) {
    return (
      <div style={{ 
        minHeight: '100vh', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        padding: '1rem',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
      }}>
        <div className="card" style={{ maxWidth: '500px', width: '100%', margin: '0 auto', textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🎤</div>
          <div style={{ fontSize: '1.2rem', color: '#666' }}>Checking for active room...</div>
        </div>
      </div>
    );
  }

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
