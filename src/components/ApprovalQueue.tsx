/**
 * Approval Queue Component
 * 
 * Shows pending users waiting for host approval
 * Only visible to host in approval mode
 */

'use client';

import { useState, useEffect } from 'react';
import type { RoomParticipant } from '@/shared/types';

interface ApprovalQueueProps {
  roomId: string;
  hostId: string;
  onUpdate?: () => void;
}

export function ApprovalQueue({ roomId, hostId, onUpdate }: ApprovalQueueProps) {
  const [pending, setPending] = useState<RoomParticipant[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);

  // Fetch pending users
  const fetchPending = async () => {
    try {
      const response = await fetch(`/api/rooms/${roomId}/pending-users`);
      if (!response.ok) throw new Error('Failed to fetch pending users');
      
      const data = await response.json();
      setPending(data.pending || []);
    } catch (error) {
      console.error('[ApprovalQueue] Error:', error);
    } finally {
      setLoading(false);
    }
  };

  // Approve user
  const handleApprove = async (userId: string) => {
    setProcessing(userId);
    try {
      const response = await fetch(`/api/rooms/${roomId}/approve-user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, host_id: hostId }),
      });

      if (!response.ok) throw new Error('Failed to approve user');

      // Remove from pending list
      setPending(prev => prev.filter(u => u.user_id !== userId));
      
      if (onUpdate) onUpdate();
    } catch (error) {
      console.error('[ApprovalQueue] Approve error:', error);
      alert('Failed to approve user');
    } finally {
      setProcessing(null);
    }
  };

  // Deny user
  const handleDeny = async (userId: string) => {
    setProcessing(userId);
    try {
      const response = await fetch(`/api/rooms/${roomId}/deny-user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, host_id: hostId }),
      });

      if (!response.ok) throw new Error('Failed to deny user');

      // Remove from pending list
      setPending(prev => prev.filter(u => u.user_id !== userId));
      
      if (onUpdate) onUpdate();
    } catch (error) {
      console.error('[ApprovalQueue] Deny error:', error);
      alert('Failed to deny user');
    } finally {
      setProcessing(null);
    }
  };

  // Poll for pending users
  useEffect(() => {
    fetchPending();
    const interval = setInterval(fetchPending, 3000); // Check every 3 seconds
    return () => clearInterval(interval);
  }, [roomId]);

  // Don't show if no pending users
  if (!loading && pending.length === 0) {
    return null;
  }

  return (
    <div style={{
      background: '#fff3cd',
      border: '1px solid #ffc107',
      borderRadius: '8px',
      padding: '1rem',
      marginBottom: '1rem',
    }}>
      <h3 style={{ 
        fontSize: '1rem', 
        fontWeight: 600, 
        marginBottom: '0.75rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem'
      }}>
        ⏳ Pending Approvals ({pending.length})
      </h3>

      {loading ? (
        <p style={{ color: '#666', fontSize: '0.9rem' }}>Loading...</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {pending.map((user) => (
            <div
              key={user.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.75rem',
                background: 'white',
                borderRadius: '6px',
                border: '1px solid #dee2e6',
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>
                  {user.user_name || 'Anonymous'}
                </div>
                <div style={{ fontSize: '0.85rem', color: '#666' }}>
                  Waiting for approval...
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  className="btn btn-primary"
                  onClick={() => handleApprove(user.user_id)}
                  disabled={processing === user.user_id}
                  style={{
                    padding: '0.5rem 1rem',
                    fontSize: '0.9rem',
                    minWidth: '80px',
                  }}
                >
                  {processing === user.user_id ? '...' : '✓ Approve'}
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => handleDeny(user.user_id)}
                  disabled={processing === user.user_id}
                  style={{
                    padding: '0.5rem 1rem',
                    fontSize: '0.9rem',
                    minWidth: '70px',
                    background: '#dc3545',
                    color: 'white',
                  }}
                >
                  {processing === user.user_id ? '...' : '✗ Deny'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <p style={{ 
        fontSize: '0.85rem', 
        color: '#856404', 
        marginTop: '0.75rem',
        marginBottom: 0 
      }}>
        💡 Pending requests expire after 15 minutes
      </p>
    </div>
  );
}
