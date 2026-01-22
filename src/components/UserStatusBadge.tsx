/**
 * User Status Badge Component
 * 
 * Shows user's approval status in the room
 * Used by guests to see if they're pending/approved/denied
 */

'use client';

interface UserStatusBadgeProps {
  status: 'approved' | 'pending' | 'denied';
  showMessage?: boolean;
}

export function UserStatusBadge({ status, showMessage = false }: UserStatusBadgeProps) {
  const config = {
    approved: {
      icon: '✓',
      label: 'Approved',
      color: '#28a745',
      bg: '#d4edda',
      message: 'You can now add songs to the queue!',
    },
    pending: {
      icon: '⏳',
      label: 'Pending Approval',
      color: '#856404',
      bg: '#fff3cd',
      message: 'Waiting for host to approve your request...',
    },
    denied: {
      icon: '✗',
      label: 'Denied',
      color: '#dc3545',
      bg: '#f8d7da',
      message: 'Host denied your join request.',
    },
  };

  const style = config[status];

  if (!showMessage) {
    // Compact badge
    return (
      <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.25rem',
        padding: '0.25rem 0.75rem',
        borderRadius: '12px',
        fontSize: '0.85rem',
        fontWeight: 600,
        color: style.color,
        background: style.bg,
      }}>
        <span>{style.icon}</span>
        <span>{style.label}</span>
      </span>
    );
  }

  // Full message card
  return (
    <div style={{
      background: style.bg,
      border: `1px solid ${style.color}`,
      borderRadius: '8px',
      padding: '1rem',
      marginBottom: '1rem',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        marginBottom: '0.5rem',
      }}>
        <span style={{ fontSize: '1.5rem' }}>{style.icon}</span>
        <span style={{
          fontSize: '1.1rem',
          fontWeight: 600,
          color: style.color,
        }}>
          {style.label}
        </span>
      </div>
      <p style={{
        margin: 0,
        color: style.color,
        fontSize: '0.9rem',
      }}>
        {style.message}
      </p>
      
      {status === 'pending' && (
        <p style={{
          margin: 0,
          marginTop: '0.5rem',
          fontSize: '0.85rem',
          color: '#856404',
        }}>
          This request will expire in 15 minutes if not approved.
        </p>
      )}
    </div>
  );
}
