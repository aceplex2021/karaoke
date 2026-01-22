/**
 * Approval Queue Component
 * 
 * Shows pending users waiting for host approval
 * Only visible to host in approval mode
 */

'use client';

import { useState, useEffect, useRef } from 'react';
import type { RoomParticipant } from '@/shared/types';

interface ApprovalQueueProps {
  roomId: string;
  hostId: string;
  onUpdate?: () => void;
  onNewUser?: (userName: string) => void;
}

export function ApprovalQueue({ roomId, hostId, onUpdate, onNewUser }: ApprovalQueueProps) {
  const [pending, setPending] = useState<RoomParticipant[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const previousCountRef = useRef<number>(0);
  const seenUserIdsRef = useRef<Set<string>>(new Set());
  const actionedUserIdsRef = useRef<Set<string>>(new Set()); // Track approved/denied users

  // Fetch pending users
  const fetchPending = async () => {
    try {
      const response = await fetch(`/api/rooms/${roomId}/pending-users`);
      if (!response.ok) throw new Error('Failed to fetch pending users');
      
      const data = await response.json();
      let newPending = data.pending || [];
      
      // Filter out users we've already actioned (approved/denied)
      newPending = newPending.filter(
        (u: RoomParticipant) => !actionedUserIdsRef.current.has(u.user_id)
      );
      
      // Detect new users for toast notification
      if (!loading && newPending.length > previousCountRef.current) {
        const newUsers = newPending.filter(
          (u: RoomParticipant) => !seenUserIdsRef.current.has(u.user_id)
        );
        
        newUsers.forEach((user: RoomParticipant) => {
          if (onNewUser) {
            onNewUser(user.user_name || 'Guest');
          }
          seenUserIdsRef.current.add(user.user_id);
        });
      }
      
      previousCountRef.current = newPending.length;
      setPending(newPending);
    } catch (error) {
      console.error('[ApprovalQueue] Error:', error);
    } finally {
      setLoading(false);
    }
  };

  // Approve user
  const handleApprove = async (userId: string, userName: string) => {
    setProcessing(userId);
    try {
      const response = await fetch(`/api/rooms/${roomId}/approve-user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, host_id: hostId }),
      });

      if (!response.ok) throw new Error('Failed to approve user');

      // Mark user as actioned so they won't reappear on refresh
      actionedUserIdsRef.current.add(userId);
      
      // Immediately remove from pending list (optimistic update)
      setPending(prev => prev.filter(u => u.user_id !== userId));
      previousCountRef.current--;
      
      if (onUpdate) onUpdate();
    } catch (error) {
      console.error('[ApprovalQueue] Approve error:', error);
      alert('Failed to approve user');
      // Remove from actioned list on error
      actionedUserIdsRef.current.delete(userId);
      // Re-fetch to restore state if failed
      fetchPending();
    } finally {
      setProcessing(null);
    }
  };

  // Deny user
  const handleDeny = async (userId: string, userName: string) => {
    setProcessing(userId);
    try {
      const response = await fetch(`/api/rooms/${roomId}/deny-user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, host_id: hostId }),
      });

      if (!response.ok) throw new Error('Failed to deny user');

      // Mark user as actioned so they won't reappear on refresh
      actionedUserIdsRef.current.add(userId);
      
      // Immediately remove from pending list (optimistic update)
      setPending(prev => prev.filter(u => u.user_id !== userId));
      previousCountRef.current--;
      
      if (onUpdate) onUpdate();
    } catch (error) {
      console.error('[ApprovalQueue] Deny error:', error);
      alert('Failed to deny user');
      // Remove from actioned list on error
      actionedUserIdsRef.current.delete(userId);
      // Re-fetch to restore state if failed
      fetchPending();
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

  return (
    <div style={{
      background: pending.length > 0 ? '#fff3cd' : '#f8f9fa',
      border: pending.length > 0 ? '1px solid #ffc107' : '1px solid #dee2e6',
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
        {pending.length > 0 ? '⏳' : '✓'} Pending Approvals ({pending.length})
      </h3>

      {loading ? (
        <p style={{ color: '#666', fontSize: '0.9rem' }}>Loading...</p>
      ) : pending.length === 0 ? (
        <div style={{ 
          padding: '1rem', 
          textAlign: 'center', 
          color: '#666',
          fontSize: '0.95rem'
        }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>✓</div>
          <div style={{ fontWeight: 500 }}>No pending approval requests</div>
          <div style={{ fontSize: '0.85rem', marginTop: '0.5rem', opacity: 0.8 }}>
            New users will appear here when they join
          </div>
        </div>
      ) : (
        <div style={{ 
          overflowX: 'auto',
          background: 'white',
          borderRadius: '6px',
          border: '1px solid #dee2e6',
        }}>
          <table style={{ 
            width: '100%', 
            borderCollapse: 'collapse',
            fontSize: '0.95rem'
          }}>
            <thead>
              <tr style={{ 
                background: '#f8f9fa',
                borderBottom: '2px solid #dee2e6'
              }}>
                <th style={{ 
                  padding: '0.75rem 1rem', 
                  textAlign: 'left',
                  fontWeight: 600,
                  color: '#495057'
                }}>
                  User
                </th>
                <th style={{ 
                  padding: '0.75rem 1rem', 
                  textAlign: 'left',
                  fontWeight: 600,
                  color: '#495057'
                }}>
                  Status
                </th>
                <th style={{ 
                  padding: '0.75rem 1rem', 
                  textAlign: 'right',
                  fontWeight: 600,
                  color: '#495057'
                }}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {pending.map((user) => (
                <tr 
                  key={user.id}
                  style={{ 
                    borderBottom: '1px solid #dee2e6',
                    transition: 'background 0.2s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#f8f9fa'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
                >
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <div style={{ fontWeight: 600, color: '#212529' }}>
                      {user.user_name || 'Guest'}
                    </div>
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <span style={{
                      display: 'inline-block',
                      padding: '0.25rem 0.75rem',
                      background: '#fff3cd',
                      color: '#856404',
                      borderRadius: '12px',
                      fontSize: '0.85rem',
                      fontWeight: 500
                    }}>
                      ⏳ Waiting
                    </span>
                  </td>
                  <td style={{ 
                    padding: '0.75rem 1rem',
                    textAlign: 'right'
                  }}>
                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                      <button
                        className="btn btn-primary"
                        onClick={() => handleApprove(user.user_id, user.user_name || 'Guest')}
                        disabled={processing === user.user_id}
                        style={{
                          padding: '0.5rem 1rem',
                          fontSize: '0.85rem',
                          minWidth: '80px',
                          borderRadius: '6px'
                        }}
                      >
                        {processing === user.user_id ? '...' : '✓ Approve'}
                      </button>
                      <button
                        className="btn btn-secondary"
                        onClick={() => handleDeny(user.user_id, user.user_name || 'Guest')}
                        disabled={processing === user.user_id}
                        style={{
                          padding: '0.5rem 1rem',
                          fontSize: '0.85rem',
                          minWidth: '70px',
                          background: '#dc3545',
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: processing === user.user_id ? 'not-allowed' : 'pointer'
                        }}
                      >
                        {processing === user.user_id ? '...' : '✗ Deny'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
