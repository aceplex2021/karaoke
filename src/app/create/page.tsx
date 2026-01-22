/**
 * Create Room Page (Host)
 * 
 * Host creates a new karaoke room with:
 * - Room name
 * - Host name
 * - Queue mode (FIFO or Round-Robin)
 * - Approval mode (Auto or Host Approval)
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getOrCreateFingerprint } from '@/lib/utils';
import { api } from '@/lib/api';
import { CommercialOnly } from '@/components/FeatureToggle';

export default function CreateRoomPage() {
  const router = useRouter();
  const [roomName, setRoomName] = useState('');
  const [hostName, setHostName] = useState('');
  const [queueMode, setQueueMode] = useState<'round_robin' | 'fifo'>('round_robin');
  const [approvalMode, setApprovalMode] = useState<'auto' | 'approval'>('auto');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleCreateRoom = async () => {
    if (!roomName.trim()) {
      setError('Room name is required');
      return;
    }

    if (!hostName.trim()) {
      setError('Your name is required');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const fingerprint = getOrCreateFingerprint();
      
      // Create room via API
      const { room } = await api.createRoom({
        room_name: roomName,
        host_fingerprint: fingerprint,
        host_display_name: hostName,
        queue_mode: queueMode,
        approval_mode: approvalMode,
      });

      console.log('[CreateRoom] Room created:', room);

      // Store in localStorage
      if (typeof window !== 'undefined') {
        localStorage.setItem('current_room_id', room.id);
        localStorage.setItem('current_room_code', room.room_code);
        localStorage.setItem('user_id', room.host_id || fingerprint);
        localStorage.setItem('user_role', 'host');
      }

      // Redirect to host dashboard
      router.push(`/room/${room.room_code}`);
    } catch (err: any) {
      console.error('[CreateRoom] Error:', err);
      setError(err.message || 'Failed to create room');
    } finally {
      setLoading(false);
    }
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
      <div className="card" style={{ maxWidth: '600px', width: '100%', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>
            🎤 Create Room
          </h1>
          <p style={{ color: '#666', fontSize: '0.95rem' }}>
            Set up your karaoke party
          </p>
        </div>

        {/* Room Name */}
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>
            Room Name
          </label>
          <input
            type="text"
            className="input"
            placeholder="My Karaoke Party"
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleCreateRoom()}
            autoFocus
          />
        </div>

        {/* Host Name */}
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>
            Your Name
          </label>
          <input
            type="text"
            className="input"
            placeholder="Host"
            value={hostName}
            onChange={(e) => setHostName(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleCreateRoom()}
          />
        </div>

        {/* Queue Mode */}
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', marginBottom: '0.75rem', fontWeight: 600 }}>
            Queue Mode
          </label>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <label style={{ 
              display: 'flex', 
              alignItems: 'flex-start', 
              cursor: 'pointer', 
              padding: '0.75rem', 
              border: '1px solid #ddd', 
              borderRadius: '4px', 
              backgroundColor: queueMode === 'round_robin' ? '#f0f8ff' : 'transparent',
            }}>
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
                  Round Robin (Recommended)
                </div>
                <div style={{ fontSize: '0.85rem', color: '#666' }}>
                  Fair rotation - everyone gets a turn before anyone goes again
                </div>
              </div>
            </label>
            
            <label style={{ 
              display: 'flex', 
              alignItems: 'flex-start', 
              cursor: 'pointer', 
              padding: '0.75rem', 
              border: '1px solid #ddd', 
              borderRadius: '4px', 
              backgroundColor: queueMode === 'fifo' ? '#f0f8ff' : 'transparent',
            }}>
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
                  Songs play in the order they were added
                </div>
              </div>
            </label>
          </div>
        </div>

        {/* Approval Mode (Commercial only) */}
        <CommercialOnly>
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', marginBottom: '0.75rem', fontWeight: 600 }}>
              Join Approval
            </label>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <label style={{ 
                display: 'flex', 
                alignItems: 'flex-start', 
                cursor: 'pointer', 
                padding: '0.75rem', 
                border: '1px solid #ddd', 
                borderRadius: '4px', 
                backgroundColor: approvalMode === 'auto' ? '#f0f8ff' : 'transparent',
              }}>
                <input
                  type="radio"
                  name="approvalMode"
                  value="auto"
                  checked={approvalMode === 'auto'}
                  onChange={(e) => setApprovalMode(e.target.value as 'auto')}
                  style={{ marginRight: '0.5rem', marginTop: '0.2rem', cursor: 'pointer' }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>
                    Auto Join
                  </div>
                  <div style={{ fontSize: '0.85rem', color: '#666' }}>
                    Anyone with the code can join and add songs immediately
                  </div>
                </div>
              </label>
              
              <label style={{ 
                display: 'flex', 
                alignItems: 'flex-start', 
                cursor: 'pointer', 
                padding: '0.75rem', 
                border: '1px solid #ddd', 
                borderRadius: '4px', 
                backgroundColor: approvalMode === 'approval' ? '#f0f8ff' : 'transparent',
              }}>
                <input
                  type="radio"
                  name="approvalMode"
                  value="approval"
                  checked={approvalMode === 'approval'}
                  onChange={(e) => setApprovalMode(e.target.value as 'approval')}
                  style={{ marginRight: '0.5rem', marginTop: '0.2rem', cursor: 'pointer' }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>
                    Host Approval Required
                  </div>
                  <div style={{ fontSize: '0.85rem', color: '#666' }}>
                    You must approve each user before they can add songs (spam control)
                  </div>
                </div>
              </label>
            </div>
          </div>
        </CommercialOnly>

        {/* Error */}
        {error && (
          <div style={{ color: '#e00', marginBottom: '1rem', fontSize: '0.9rem' }}>
            {error}
          </div>
        )}

        {/* Create Button */}
        <button
          className="btn btn-primary"
          onClick={handleCreateRoom}
          disabled={loading}
          style={{ width: '100%', marginBottom: '1rem', padding: '1rem', fontSize: '1.1rem' }}
        >
          {loading ? 'Creating Room...' : '🎤 Create Room'}
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
      </div>
    </div>
  );
}
