/**
 * Approval Queue Component (v4.4)
 * 
 * Shows ALL participants with full management
 * - Approved users (can kick)
 * - Pending users (can approve/deny)
 * - Denied users (can re-approve/remove)
 * - Expired users (can re-approve/remove)
 * 
 * v4.4.1: Added Realtime subscription for instant updates
 */

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { RoomParticipant } from '@/shared/types';

interface ApprovalQueueProps {
  roomId: string;
  hostId: string;
  onUpdate?: () => void;
  onNewUser?: (userName: string) => void;
}

interface CategorizedParticipants {
  approved: RoomParticipant[];
  pending: RoomParticipant[];
  denied: RoomParticipant[];
  expired: RoomParticipant[];
}

export function ApprovalQueue({ roomId, hostId, onUpdate, onNewUser }: ApprovalQueueProps) {
  const [participants, setParticipants] = useState<RoomParticipant[]>([]);
  const [categorized, setCategorized] = useState<CategorizedParticipants>({
    approved: [],
    pending: [],
    denied: [],
    expired: [],
  });
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [useRealtime, setUseRealtime] = useState(true); // v4.4.1: Realtime toggle
  const seenUserIdsRef = useRef<Set<string>>(new Set());
  const hasFirstPollRef = useRef<boolean>(false); // Track if first poll completed (v4.4)
  const realtimeChannelRef = useRef<any>(null); // v4.4.1: Realtime channel

  // Fetch all participants (v4.4.1 - useCallback to prevent stale closures in Realtime)
  const fetchParticipants = useCallback(async () => {
    try {
      console.log('[ApprovalQueue] 🔄 Fetching participants...');
      const response = await fetch(`/api/rooms/${roomId}/participants`, {
        cache: 'no-store', // v4.4.1: Disable browser caching
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      });
      if (!response.ok) throw new Error('Failed to fetch participants');
      
      const data = await response.json();
      const allParticipants = data.participants || [];
      const categorizedData = data.categorized || { approved: [], pending: [], denied: [], expired: [] };
      
      console.log('[ApprovalQueue] ✅ Fetched:', {
        total: allParticipants.length,
        approved: categorizedData.approved.length,
        pending: categorizedData.pending.length,
        denied: categorizedData.denied.length,
        expired: categorizedData.expired.length,
        userIds: allParticipants.map((p: any) => `${p.user_name}(${p.user_id.slice(-4)})`).join(', ')
      });
      
      setParticipants(allParticipants);
      setCategorized(categorizedData);
      
      // v4.4 Fix B1-B2: Detect NEW pending users by user_id
      // Only fire toasts after first poll completes
      if (hasFirstPollRef.current) {
        const newPendingUsers = categorizedData.pending.filter(
          (u: RoomParticipant) => !seenUserIdsRef.current.has(u.user_id)
        );
        
        if (newPendingUsers.length > 0) {
          newPendingUsers.forEach((user: RoomParticipant) => {
            console.log('[ApprovalQueue] New user detected:', user.user_name);
            if (onNewUser) {
              onNewUser(user.user_name || 'Guest');
            }
            seenUserIdsRef.current.add(user.user_id);
          });
        }
      }
      
      // Mark first poll as complete
      if (!hasFirstPollRef.current) {
        hasFirstPollRef.current = true;
        // Add all current pending users to "seen"
        categorizedData.pending.forEach((u: RoomParticipant) => {
          seenUserIdsRef.current.add(u.user_id);
        });
      }
    } catch (error) {
      console.error('[ApprovalQueue] Error:', error);
    } finally {
      setLoading(false);
    }
  }, [roomId, onNewUser]);

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

      // Refresh participant list
      await fetchParticipants();
      
      if (onUpdate) onUpdate();
    } catch (error) {
      console.error('[ApprovalQueue] Approve error:', error);
      alert('Failed to approve user');
      // Re-fetch to restore state if failed
      await fetchParticipants();
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

      // v4.4 Fix B3: Clear seenUserIds so user can trigger toast if they rejoin
      seenUserIdsRef.current.delete(userId);
      
      // Refresh participant list
      await fetchParticipants();
      
      if (onUpdate) onUpdate();
    } catch (error) {
      console.error('[ApprovalQueue] Deny error:', error);
      alert('Failed to deny user');
      // Re-fetch to restore state if failed
      await fetchParticipants();
    } finally {
      setProcessing(null);
    }
  };

  // Kick user (v4.4)
  const handleKick = async (userId: string, userName: string) => {
    if (!confirm(`Kick ${userName} from the room?`)) return;
    
    setProcessing(userId);
    try {
      const response = await fetch(`/api/rooms/${roomId}/kick-user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, host_id: hostId }),
      });

      if (!response.ok) throw new Error('Failed to kick user');

      // Refresh participant list
      await fetchParticipants();
      
      if (onUpdate) onUpdate();
    } catch (error) {
      console.error('[ApprovalQueue] Kick error:', error);
      alert('Failed to kick user');
      await fetchParticipants();
    } finally {
      setProcessing(null);
    }
  };

  // Remove user (v4.4)
  const handleRemove = async (userId: string, userName: string) => {
    if (!confirm(`Remove ${userName}? They will be able to rejoin the room.`)) return;
    
    setProcessing(userId);
    try {
      console.log('[ApprovalQueue] Removing user:', userId);
      const response = await fetch(`/api/rooms/${roomId}/remove-user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, host_id: hostId }),
      });

      if (!response.ok) {
        const error = await response.json();
        console.error('[ApprovalQueue] Remove failed:', error);
        throw new Error(error.error || 'Failed to remove user');
      }

      const result = await response.json();
      console.log('[ApprovalQueue] Remove success:', result);

      // v4.4: Clear from seenUserIds so they can trigger toast if they rejoin
      seenUserIdsRef.current.delete(userId);
      
      // Small delay to ensure DB transaction completes
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Refresh participant list
      await fetchParticipants();
      
      if (onUpdate) onUpdate();
    } catch (error) {
      console.error('[ApprovalQueue] Remove error:', error);
      alert(`Failed to remove user: ${error instanceof Error ? error.message : 'Unknown error'}`);
      await fetchParticipants();
    } finally {
      setProcessing(null);
    }
  };

  // Re-approve user (v4.4)
  const handleReapprove = async (userId: string, userName: string) => {
    setProcessing(userId);
    try {
      console.log('[ApprovalQueue] Re-approving user:', userId);
      const response = await fetch(`/api/rooms/${roomId}/reapprove-user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, host_id: hostId }),
      });

      if (!response.ok) {
        const error = await response.json();
        console.error('[ApprovalQueue] Re-approve failed:', error);
        throw new Error(error.error || 'Failed to re-approve user');
      }

      const result = await response.json();
      console.log('[ApprovalQueue] Re-approve success:', result);

      // Small delay to ensure DB transaction completes
      await new Promise(resolve => setTimeout(resolve, 100));

      // Refresh participant list
      await fetchParticipants();
      
      if (onUpdate) onUpdate();
    } catch (error) {
      console.error('[ApprovalQueue] Re-approve error:', error);
      alert(`Failed to re-approve user: ${error instanceof Error ? error.message : 'Unknown error'}`);
      await fetchParticipants();
    } finally {
      setProcessing(null);
    }
  };

  // v4.4.1: Subscribe to Realtime updates for participants
  const subscribeToParticipants = useCallback(() => {
    if (realtimeChannelRef.current) {
      supabase.removeChannel(realtimeChannelRef.current);
      realtimeChannelRef.current = null;
    }

    console.log('[ApprovalQueue] 🔌 Setting up Realtime subscription for participants in room:', roomId);

    const channel = supabase
      .channel(`participants-${roomId}`)
      .on(
        'postgres_changes',
        { 
          event: '*', // Listen to INSERT, UPDATE, DELETE
          schema: 'public', 
          table: 'kara_room_participants', 
          filter: `room_id=eq.${roomId}` 
        },
        (payload: any) => {
          console.log(`[ApprovalQueue] 📡 Realtime: ${payload.eventType} event`, {
            eventType: payload.eventType,
            userId: payload.new?.user_id || payload.old?.user_id,
            userName: payload.new?.user_name || payload.old?.user_name,
            status: payload.new?.status || payload.old?.status
          });
          // Refresh immediately on any change
          fetchParticipants();
        }
      )
      .subscribe((status) => {
        console.log('[ApprovalQueue] Realtime subscription status:', status);
        if (status === 'SUBSCRIBED') {
          console.log('[ApprovalQueue] ✅ Realtime connected (stable)');
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error('[ApprovalQueue] ❌ Realtime failed, falling back to polling');
          setUseRealtime(false);
        }
      });

    realtimeChannelRef.current = channel;
  }, [roomId]); // FIXED: Only roomId dependency, fetchParticipants called directly

  // Poll for all participants (v4.4.1 - FIXED: removed functions from dependencies)
  useEffect(() => {
    // Initial fetch
    fetchParticipants();

    // v4.4.1: Use Realtime if enabled, otherwise poll
    if (useRealtime) {
      subscribeToParticipants();
      // Still poll every 10s as backup (much slower than before)
      const backupInterval = setInterval(() => fetchParticipants(), 10000);
      return () => {
        clearInterval(backupInterval);
        if (realtimeChannelRef.current) {
          console.log('[ApprovalQueue] Cleaning up Realtime subscription');
          supabase.removeChannel(realtimeChannelRef.current);
          realtimeChannelRef.current = null;
        }
      };
    } else {
      // Fallback: poll every 3 seconds
      const interval = setInterval(() => fetchParticipants(), 3000);
      return () => clearInterval(interval);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, useRealtime]); // ONLY roomId and useRealtime - functions handled via useCallback

  const totalCount = participants.length;
  const pendingCount = categorized.pending.length;

  return (
    <div style={{
      background: pendingCount > 0 ? '#fff3cd' : '#f8f9fa',
      border: pendingCount > 0 ? '1px solid #ffc107' : '1px solid #dee2e6',
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
        {pendingCount > 0 ? '⏳' : '👥'} Room Participants ({totalCount})
        {pendingCount > 0 && (
          <span style={{ 
            background: '#ffc107', 
            color: '#856404', 
            padding: '0.25rem 0.5rem', 
            borderRadius: '12px', 
            fontSize: '0.85rem',
            fontWeight: 500
          }}>
            {pendingCount} pending
          </span>
        )}
      </h3>

      {loading ? (
        <p style={{ color: '#666', fontSize: '0.9rem' }}>Loading...</p>
      ) : totalCount === 0 ? (
        <div style={{ 
          padding: '1rem', 
          textAlign: 'center', 
          color: '#666',
          fontSize: '0.95rem'
        }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>👥</div>
          <div style={{ fontWeight: 500 }}>No participants yet</div>
          <div style={{ fontSize: '0.85rem', marginTop: '0.5rem', opacity: 0.8 }}>
            Users will appear here when they join the room
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
                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600, color: '#495057' }}>User</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600, color: '#495057' }}>Status</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 600, color: '#495057' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {/* Approved Users */}
              {categorized.approved.map((user) => (
                <tr key={user.id} style={{ borderBottom: '1px solid #dee2e6' }}>
                  <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>
                    {user.user_name || 'Guest'}
                    {user.role === 'host' && <span style={{ marginLeft: '0.5rem', color: '#0070f3' }}>(Host)</span>}
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <span style={{ display: 'inline-block', padding: '0.25rem 0.75rem', background: '#d4edda', color: '#155724', borderRadius: '12px', fontSize: '0.85rem', fontWeight: 500 }}>
                      ✅ Approved
                    </span>
                  </td>
                  <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                    {user.role !== 'host' && (
                      <button onClick={() => handleKick(user.user_id, user.user_name || 'Guest')} disabled={processing === user.user_id} style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', background: '#dc3545', color: 'white', border: 'none', borderRadius: '6px', cursor: processing === user.user_id ? 'not-allowed' : 'pointer' }}>
                        {processing === user.user_id ? '...' : '🚫 Kick'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}

              {/* Pending Users */}
              {categorized.pending.map((user) => {
                const expiresAt = user.expires_at ? new Date(user.expires_at) : null;
                const now = new Date();
                const minutesLeft = expiresAt ? Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 60000)) : 0;
                
                return (
                  <tr key={user.id} style={{ borderBottom: '1px solid #dee2e6', background: '#fffbf0' }}>
                    <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>{user.user_name || 'Guest'}</td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <span style={{ display: 'inline-block', padding: '0.25rem 0.75rem', background: '#fff3cd', color: '#856404', borderRadius: '12px', fontSize: '0.85rem', fontWeight: 500 }}>
                        ⏳ Pending ({minutesLeft}m left)
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                        <button onClick={() => handleApprove(user.user_id, user.user_name || 'Guest')} disabled={processing === user.user_id} style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', minWidth: '80px', background: '#28a745', color: 'white', border: 'none', borderRadius: '6px', cursor: processing === user.user_id ? 'not-allowed' : 'pointer' }}>
                          {processing === user.user_id ? '...' : '✓ Approve'}
                        </button>
                        <button onClick={() => handleDeny(user.user_id, user.user_name || 'Guest')} disabled={processing === user.user_id} style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', minWidth: '70px', background: '#dc3545', color: 'white', border: 'none', borderRadius: '6px', cursor: processing === user.user_id ? 'not-allowed' : 'pointer' }}>
                          {processing === user.user_id ? '...' : '✗ Deny'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {/* Denied Users */}
              {categorized.denied.map((user) => (
                <tr key={user.id} style={{ borderBottom: '1px solid #dee2e6', opacity: 0.7 }}>
                  <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>{user.user_name || 'Guest'}</td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <span style={{ display: 'inline-block', padding: '0.25rem 0.75rem', background: '#f8d7da', color: '#721c24', borderRadius: '12px', fontSize: '0.85rem', fontWeight: 500 }}>
                      ❌ Denied
                    </span>
                  </td>
                  <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                      <button onClick={() => handleReapprove(user.user_id, user.user_name || 'Guest')} disabled={processing === user.user_id} style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', background: '#17a2b8', color: 'white', border: 'none', borderRadius: '6px', cursor: processing === user.user_id ? 'not-allowed' : 'pointer' }}>
                        {processing === user.user_id ? '...' : '♻️ Re-Approve'}
                      </button>
                      <button onClick={() => handleRemove(user.user_id, user.user_name || 'Guest')} disabled={processing === user.user_id} style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', background: '#6c757d', color: 'white', border: 'none', borderRadius: '6px', cursor: processing === user.user_id ? 'not-allowed' : 'pointer' }}>
                        {processing === user.user_id ? '...' : '🗑️ Remove'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {/* Expired Users */}
              {categorized.expired.map((user) => (
                <tr key={user.id} style={{ borderBottom: '1px solid #dee2e6', opacity: 0.6 }}>
                  <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>{user.user_name || 'Guest'}</td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <span style={{ display: 'inline-block', padding: '0.25rem 0.75rem', background: '#e2e3e5', color: '#383d41', borderRadius: '12px', fontSize: '0.85rem', fontWeight: 500 }}>
                      ⏰ Expired
                    </span>
                  </td>
                  <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                      <button onClick={() => handleReapprove(user.user_id, user.user_name || 'Guest')} disabled={processing === user.user_id} style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', background: '#17a2b8', color: 'white', border: 'none', borderRadius: '6px', cursor: processing === user.user_id ? 'not-allowed' : 'pointer' }}>
                        {processing === user.user_id ? '...' : '♻️ Re-Approve'}
                      </button>
                      <button onClick={() => handleRemove(user.user_id, user.user_name || 'Guest')} disabled={processing === user.user_id} style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', background: '#6c757d', color: 'white', border: 'none', borderRadius: '6px', cursor: processing === user.user_id ? 'not-allowed' : 'pointer' }}>
                        {processing === user.user_id ? '...' : '🗑️ Remove'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p style={{ fontSize: '0.85rem', color: '#666', marginTop: '0.75rem', marginBottom: 0 }}>
        💡 <strong>Tip:</strong> Pending requests expire after 15 minutes. Remove users to allow them to rejoin.
      </p>
    </div>
  );
}
