'use client';

import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
}

interface ToastContainerProps {
  toasts: Toast[];
  onRemove: (id: string) => void;
}

export function ToastContainer({ toasts, onRemove }: ToastContainerProps) {
  return (
    <div
      style={{
        position: 'fixed',
        top: '1rem',
        right: '1rem',
        zIndex: 10000,
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
        maxWidth: '400px',
        width: '100%',
        pointerEvents: 'none',
      }}
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onRemove={onRemove} />
      ))}
    </div>
  );
}

interface ToastItemProps {
  toast: Toast;
  onRemove: (id: string) => void;
}

// v4.7.2: Memoize ToastItem to prevent re-renders when parent re-renders
const ToastItem = React.memo(function ToastItem({ toast, onRemove }: ToastItemProps) {
  const [isVisible, setIsVisible] = useState(false);
  const onRemoveRef = useRef(onRemove); // v4.7.2: Stable ref to prevent timer resets

  // Keep ref updated
  useEffect(() => {
    onRemoveRef.current = onRemove;
  }, [onRemove]);

  useEffect(() => {
    // Trigger animation
    setIsVisible(true);

    // v4.7.2: Auto-remove after 5 seconds (default) - timer won't reset on re-renders
    const duration = toast.duration || 5000;
    console.log('[Toast] Setting timer for toast:', toast.id, 'duration:', duration, 'ms');
    const timer = setTimeout(() => {
      console.log('[Toast] Timer fired for toast:', toast.id, 'fading out...');
      setIsVisible(false);
      setTimeout(() => {
        console.log('[Toast] Removing toast after fade-out:', toast.id);
        onRemoveRef.current(toast.id);
      }, 300); // Wait for fade-out animation
    }, duration);

    return () => {
      console.log('[Toast] Cleaning up timer for toast:', toast.id);
      clearTimeout(timer);
    };
  }, [toast.id, toast.duration]); // Removed onRemove from deps

  const getToastStyles = (): React.CSSProperties => {
    const baseStyles: React.CSSProperties = {
      padding: '1rem 1.25rem',
      borderRadius: '8px',
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
      display: 'flex',
      alignItems: 'center',
      gap: '0.75rem',
      pointerEvents: 'auto' as const,
      cursor: 'pointer',
      transition: 'all 0.3s ease',
      transform: isVisible ? 'translateX(0)' : 'translateX(400px)',
      opacity: isVisible ? 1 : 0,
      maxWidth: '100%',
      wordBreak: 'break-word',
    };

    switch (toast.type) {
      case 'success':
        return {
          ...baseStyles,
          background: 'linear-gradient(135deg, #4CAF50 0%, #45a049 100%)',
          color: 'white',
          borderLeft: '4px solid #2E7D32',
        };
      case 'error':
        return {
          ...baseStyles,
          background: 'linear-gradient(135deg, #f44336 0%, #d32f2f 100%)',
          color: 'white',
          borderLeft: '4px solid #c62828',
        };
      case 'warning':
        return {
          ...baseStyles,
          background: 'linear-gradient(135deg, #FF9800 0%, #F57C00 100%)',
          color: 'white',
          borderLeft: '4px solid #E65100',
        };
      case 'info':
      default:
        return {
          ...baseStyles,
          background: 'linear-gradient(135deg, #2196F3 0%, #1976D2 100%)',
          color: 'white',
          borderLeft: '4px solid #1565C0',
        };
    }
  };

  const getIcon = () => {
    switch (toast.type) {
      case 'success':
        return '✅';
      case 'error':
        return '❌';
      case 'warning':
        return '⚠️';
      case 'info':
      default:
        return 'ℹ️';
    }
  };

  return (
    <div
      style={getToastStyles()}
      onClick={() => {
        setIsVisible(false);
        setTimeout(() => onRemoveRef.current(toast.id), 300);
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = isVisible ? 'translateX(0) scale(1.02)' : 'translateX(400px)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = isVisible ? 'translateX(0)' : 'translateX(400px)';
      }}
    >
      <span style={{ fontSize: '1.25rem', flexShrink: 0 }}>{getIcon()}</span>
      <span style={{ flex: 1, fontSize: '0.95rem', lineHeight: '1.4' }}>{toast.message}</span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setIsVisible(false);
          setTimeout(() => onRemoveRef.current(toast.id), 300);
        }}
        style={{
          background: 'rgba(255, 255, 255, 0.2)',
          border: 'none',
          color: 'white',
          borderRadius: '50%',
          width: '24px',
          height: '24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          fontSize: '1rem',
          flexShrink: 0,
          transition: 'background 0.2s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
        }}
      >
        ×
      </button>
    </div>
  );
}); // End React.memo

// Hook for using toasts
export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  // v4.7.2: Memoize removeToast to prevent recreation on every render
  const removeToast = useCallback((id: string) => {
    console.log('[Toast] Removing toast:', id);
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback((message: string, type: ToastType = 'info', duration?: number) => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    const newToast: Toast = { id, message, type, duration };
    console.log('[Toast] Adding toast:', id, message);
    setToasts((prev) => [...prev, newToast]);
    return id;
  }, []);

  const success = useCallback((message: string, duration?: number) => showToast(message, 'success', duration), [showToast]);
  const error = useCallback((message: string, duration?: number) => showToast(message, 'error', duration), [showToast]);
  const warning = useCallback((message: string, duration?: number) => showToast(message, 'warning', duration), [showToast]);
  const info = useCallback((message: string, duration?: number) => showToast(message, 'info', duration), [showToast]);

  // v4.7.2: Memoize the ToastContainer component to prevent remounting on parent re-renders
  const Container = useMemo(() => {
    return function MemoizedToastContainer() {
      return <ToastContainer toasts={toasts} onRemove={removeToast} />;
    };
  }, [toasts, removeToast]);

  return {
    toasts,
    showToast,
    removeToast,
    success,
    error,
    warning,
    info,
    ToastContainer: Container,
  };
}
