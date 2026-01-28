'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { getOrCreateFingerprint, isAndroid, isIOS, isDesktop } from '@/lib/utils';
import type { Room, User, Song, QueueItem, SongGroupResult, GroupVersion, RoomState, VersionSearchResult, VersionSearchResponse } from '@/shared/types';
import { useToast } from '@/components/Toast';
import { VersionCard } from '@/components/VersionCard';
import { usePreview } from '@/contexts/PreviewContext';
import { ApprovalQueue } from '@/components/ApprovalQueue';
import { SearchRedirect } from '@/components/SearchRedirect';
import { appConfig } from '@/lib/config';
import { YouTubePlayer } from '@/components/YouTubePlayer';
import { extractYouTubeId } from '@/lib/youtube';

// ====================================
// VERSION DISPLAY HELPERS
// ====================================

/**
 * Format mixer label for user-friendly display
 */
function formatMixerLabel(label: string | null | undefined): string {
  if (!label) return 'Standard';
  
  const labelMap: Record<string, string> = {
    'nam': 'Male Voice',
    'nu': 'Female Voice',
    'nam_nu': 'Duet (Male & Female)',
    'beat': 'Beat Only (Instrumental)',
    'acoustic': 'Acoustic Version',
    'remix': 'Remix',
    'original': 'Original',
    'karaoke': 'Karaoke',
  };
  
  const normalized = label.toLowerCase().trim();
  return labelMap[normalized] || label.toUpperCase();
}

/**
 * Get version icon based on mixer type
 */
function getVersionIcon(label: string | null | undefined): string {
  if (!label) return '🎤';
  
  const iconMap: Record<string, string> = {
    'nam': '👨',      // Male
    'nu': '👩',       // Female
    'nam_nu': '👫',   // Duet
    'beat': '🎵',     // Instrumental
    'acoustic': '🎸', // Acoustic
    'remix': '🎧',    // Remix
    'original': '🎤', // Original
    'karaoke': '🎤',  // Karaoke
  };
  
  const normalized = label.toLowerCase().trim();
  return iconMap[normalized] || '🎤';
}

/**
 * Format musical key
 */
function formatKey(key: string | null | undefined): string {
  if (!key) return '';
  return `Key: ${key}`;
}

/**
 * Format tempo/BPM
 */
function formatTempo(tempo: number | null | undefined): string {
  if (!tempo) return '';
  return `${tempo} BPM`;
}

/**
 * Get user-friendly description for mixer type
 */
function getVersionDescription(label: string | null | undefined): string {
  if (!label) return 'Standard karaoke version';
  
  const descriptions: Record<string, string> = {
    'nam': 'Lower pitch, suitable for male singers',
    'nu': 'Higher pitch, suitable for female singers',
    'nam_nu': 'Duet version with both male and female parts',
    'beat': 'Instrumental only, no vocals',
    'acoustic': 'Unplugged acoustic arrangement',
    'remix': 'Modern remix with different arrangement',
  };
  
  const normalized = label.toLowerCase().trim();
  return descriptions[normalized] || 'Standard karaoke version';
}

/**
 * Build complete version description with all available metadata
 */
function buildVersionDescription(version: GroupVersion): string[] {
  const parts: string[] = [];
  
  // Always show mixer type (most important)
  parts.push(formatMixerLabel(version.label));
  
  // Add key if available
  if (version.pitch) {
    parts.push(formatKey(version.pitch));
  }
  
  // Add tempo if available
  if (version.tempo) {
    parts.push(formatTempo(version.tempo));
  }
  
  return parts;
}

// ====================================
// MODAL COMPONENTS
// ====================================

// Name Input Modal Component
function NameInputModal({
  onConfirm,
  initialName,
}: {
  onConfirm: (name: string) => void;
  initialName?: string;
}) {
  const [name, setName] = useState(initialName || '');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Focus input when modal opens
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (trimmedName.length > 0) {
      onConfirm(trimmedName);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000,
        padding: '1rem',
      }}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: '12px',
          padding: '1.5rem',
          maxWidth: '400px',
          width: '100%',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ margin: 0, marginBottom: '1rem', fontSize: '1.5rem' }}>
          Enter Your Name
        </h2>
        <p style={{ margin: 0, marginBottom: '1.5rem', color: '#666', fontSize: '0.9rem' }}>
          Please enter your name to join the room. This will help others identify you.
        </p>
        <form onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            maxLength={50}
            style={{
              width: '100%',
              padding: '0.75rem',
              fontSize: '1rem',
              border: '2px solid #e0e0e0',
              borderRadius: '8px',
              marginBottom: '1rem',
              boxSizing: 'border-box',
            }}
            onKeyPress={(e) => {
              if (e.key === 'Enter') {
                handleSubmit(e);
              }
            }}
          />
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
            <button
              type="submit"
              disabled={name.trim().length === 0}
              style={{
                padding: '0.75rem 1.5rem',
                fontSize: '1rem',
                background: name.trim().length > 0 ? '#0070f3' : '#ccc',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                cursor: name.trim().length > 0 ? 'pointer' : 'not-allowed',
                fontWeight: '500',
              }}
            >
              Join Room
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Enhanced Version Selector Modal Component with Complete Metadata
function VersionSelectorModal({
  groupId,
  group,
  onSelect,
  onClose,
}: {
  groupId: string;
  group: SongGroupResult;
  onSelect: (versionId: string) => void;
  onClose: () => void;
}) {
  const [versions, setVersions] = useState<GroupVersion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadVersions = async () => {
      try {
        const data = await api.getGroupVersions(groupId);
        console.log('[VersionSelector] Loaded versions:', data.versions);
        setVersions(data.versions);
      } catch (err) {
        console.error('Failed to load versions:', err);
      } finally {
        setLoading(false);
      }
    };
    loadVersions();
  }, [groupId]);

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '1rem',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: '16px',
          padding: '1.5rem',
          maxWidth: '600px',
          width: '90%',
          maxHeight: '85vh',
          overflowY: 'auto',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', paddingBottom: '1rem', borderBottom: '2px solid #eee' }}>
          <h2 style={{ margin: 0, fontSize: '1.5rem', color: '#333' }}>Choose Your Version</h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '2rem',
              cursor: 'pointer',
              width: '40px',
              height: '40px',
              padding: 0,
              color: '#999',
              transition: 'color 0.2s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#333')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#999')}
          >
            ×
          </button>
        </div>

        {/* Song Info */}
        <div style={{ marginBottom: '1.5rem', paddingBottom: '1rem', borderBottom: '1px solid #eee' }}>
          <strong style={{ fontSize: '1.1rem' }}>{group.display_title}</strong>
          {group.artists.length > 0 && (
            <div style={{ fontSize: '0.9rem', marginTop: '0.25rem', color: '#666' }}>
              {group.artists.join(', ')}
            </div>
          )}
        </div>

        {/* Versions List */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: '#666' }}>
            Loading versions...
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1rem' }}>
            {versions.map((version) => {
              const icon = getVersionIcon(version.label);
              const mixerLabel = formatMixerLabel(version.label);
              const description = getVersionDescription(version.label);
              const isRecommended = version.is_default;

              return (
                <div
                  key={version.version_id}
                  style={{
                    padding: '1.25rem',
                    border: isRecommended ? '2px solid #4CAF50' : '2px solid #ddd',
                    borderRadius: '12px',
                    transition: 'all 0.3s',
                    background: isRecommended 
                      ? 'linear-gradient(135deg, rgba(76, 175, 80, 0.08) 0%, rgba(76, 175, 80, 0.02) 100%)'
                      : 'white',
                    boxShadow: isRecommended ? '0 2px 8px rgba(76, 175, 80, 0.2)' : 'none',
                    cursor: 'pointer',
                  }}
                  onClick={() => onSelect(version.version_id)}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.boxShadow = '0 6px 16px rgba(0, 0, 0, 0.12)';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.boxShadow = isRecommended ? '0 2px 8px rgba(76, 175, 80, 0.2)' : 'none';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  {/* Version Header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                    <span style={{ fontSize: '2.5rem', flexShrink: 0 }}>{icon}</span>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      <h3 style={{ margin: 0, fontWeight: '700', fontSize: '1.2rem', color: '#333' }}>
                        {mixerLabel}
                      </h3>
                      {isRecommended && (
                        <span style={{
                          background: 'linear-gradient(135deg, #4CAF50 0%, #45a049 100%)',
                          color: 'white',
                          padding: '0.25rem 0.75rem',
                          borderRadius: '20px',
                          fontSize: '0.8rem',
                          fontWeight: '600',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.25rem',
                          width: 'fit-content',
                        }}>
                          ⭐ Recommended
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Version Info: Format - Tone - Channel - Style - Artist */}
                  {(version.performance_type || version.tone || version.channel || version.style || version.artist_name) && (
                    <div style={{
                      fontSize: '0.95rem',
                      color: '#555',
                      marginBottom: '1rem',
                      paddingBottom: '1rem',
                      borderBottom: '1px solid #eee',
                      fontWeight: '500',
                    }}>
                      {[
                        version.performance_type && version.performance_type !== 'solo' && 
                          `Format: ${version.performance_type.charAt(0).toUpperCase() + version.performance_type.slice(1)}`,
                        version.tone && `Tone: ${version.tone}`,
                        version.channel && `Channel: ${version.channel}`,
                        version.style && `Style: ${version.style}`,
                        version.artist_name && `Artist: ${version.artist_name}`
                      ].filter(Boolean).join(' - ')}
                    </div>
                  )}

                  {/* Metadata Tags */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
                    {version.pitch && (
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        padding: '0.5rem 0.75rem',
                        background: 'linear-gradient(135deg, #E3F2FD 0%, #BBDEFB 100%)',
                        color: '#1976D2',
                        borderRadius: '8px',
                        fontSize: '0.9rem',
                      }}>
                        <span style={{ fontSize: '1.1rem' }}>🎹</span>
                        <span style={{ fontWeight: '600' }}>Key:</span>
                        <span style={{ fontWeight: '700' }}>{version.pitch}</span>
                      </div>
                    )}
                    {version.tempo && (
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        padding: '0.5rem 0.75rem',
                        background: 'linear-gradient(135deg, #FFF3E0 0%, #FFE0B2 100%)',
                        color: '#F57C00',
                        borderRadius: '8px',
                        fontSize: '0.9rem',
                      }}>
                        <span style={{ fontSize: '1.1rem' }}>⚡</span>
                        <span style={{ fontWeight: '600' }}>Tempo:</span>
                        <span style={{ fontWeight: '700' }}>{version.tempo} BPM</span>
                      </div>
                    )}
                    {!version.pitch && !version.tempo && (
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        padding: '0.5rem 0.75rem',
                        background: 'linear-gradient(135deg, #F3E5F5 0%, #E1BEE7 100%)',
                        color: '#7B1FA2',
                        borderRadius: '8px',
                        fontSize: '0.9rem',
                      }}>
                        <span style={{ fontSize: '1.1rem' }}>✨</span>
                        <span style={{ fontWeight: '700' }}>Standard Version</span>
                      </div>
                    )}
                  </div>

                  {/* Description */}
                  <div style={{
                    padding: '0.75rem',
                    background: 'rgba(33, 150, 243, 0.08)',
                    borderLeft: '3px solid #2196F3',
                    borderRadius: '6px',
                    fontSize: '0.9rem',
                    color: '#555',
                    lineHeight: '1.5',
                    marginBottom: '1rem',
                  }}>
                    {description}
                  </div>

                  {/* Select Button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelect(version.version_id);
                    }}
                    style={{
                      width: '100%',
                      padding: '1rem',
                      background: isRecommended 
                        ? 'linear-gradient(135deg, #4CAF50 0%, #45a049 100%)'
                        : 'linear-gradient(135deg, #2196F3 0%, #1976D2 100%)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '10px',
                      fontWeight: '700',
                      fontSize: '1rem',
                      cursor: 'pointer',
                      transition: 'all 0.3s',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.5rem',
                      boxShadow: isRecommended 
                        ? '0 4px 12px rgba(76, 175, 80, 0.3)'
                        : '0 4px 12px rgba(33, 150, 243, 0.3)',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = isRecommended
                        ? 'linear-gradient(135deg, #45a049 0%, #388E3C 100%)'
                        : 'linear-gradient(135deg, #1976D2 0%, #1565C0 100%)';
                      e.currentTarget.style.boxShadow = isRecommended
                        ? '0 6px 16px rgba(76, 175, 80, 0.4)'
                        : '0 6px 16px rgba(33, 150, 243, 0.4)';
                      e.currentTarget.style.transform = 'translateY(-2px)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = isRecommended
                        ? 'linear-gradient(135deg, #4CAF50 0%, #45a049 100%)'
                        : 'linear-gradient(135deg, #2196F3 0%, #1976D2 100%)';
                      e.currentTarget.style.boxShadow = isRecommended
                        ? '0 4px 12px rgba(76, 175, 80, 0.3)'
                        : '0 4px 12px rgba(33, 150, 243, 0.3)';
                      e.currentTarget.style.transform = 'translateY(0)';
                    }}
                  >
                    <span style={{ fontSize: '1.2rem' }}>🎤</span>
                    Add This Version
                  </button>
                </div>
              );
            })}
            {versions.length === 0 && (
              <div style={{ textAlign: 'center', padding: '2rem', color: '#666' }}>
                No versions available
              </div>
            )}
          </div>
        )}

        {/* Footer Help Text */}
        <div style={{ paddingTop: '1rem', borderTop: '1px solid #eee' }}>
          <p style={{ textAlign: 'center', color: '#666', fontSize: '0.9rem', margin: 0, lineHeight: '1.5' }}>
            💡 Tip: Choose the version that matches your vocal range
          </p>
        </div>
      </div>
    </div>
  );
}

export default function RoomPage() {
  const params = useParams();
  const code = params.code as string;

  const [room, setRoom] = useState<Room | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]); // Ledger order (all pending items)
  const [upNext, setUpNext] = useState<QueueItem | null>(null); // Turn order (next to play, read-only)
  const [currentSong, setCurrentSong] = useState<QueueItem | null>(null); // Currently playing
  const [searchResults, setSearchResults] = useState<VersionSearchResult[]>([]); // UPDATED: Flat version list
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [addingToQueue, setAddingToQueue] = useState(false);
  const [removingFromQueue, setRemovingFromQueue] = useState(false);
  const [reorderingId, setReorderingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'search' | 'queue' | 'history' | 'favorites' | 'approval'>('search');
  const [showNameInput, setShowNameInput] = useState(false);
  const [isHost, setIsHost] = useState(false);
  const [showConfirmRemove, setShowConfirmRemove] = useState(false);
  const [pendingRemove, setPendingRemove] = useState<{ id: string; title: string } | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [favorites, setFavorites] = useState<Song[]>([]);
  const [favoritesLoading, setFavoritesLoading] = useState(false);
  const [favoriteSongIds, setFavoriteSongIds] = useState<Set<string>>(new Set());
  const [favoritesSearchQuery, setFavoritesSearchQuery] = useState(''); // v4.8.1: Search filter for favorites
  const [showGoHomeButton, setShowGoHomeButton] = useState(false); // Phase 1: Show "Go Home" button for expired rooms
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [addingYoutube, setAddingYoutube] = useState(false);
  const [userApprovalStatus, setUserApprovalStatus] = useState<string | null>(null); // 'approved', 'pending', 'denied', null
  const [clipboardYouTube, setClipboardYouTube] = useState<{ url: string; title: string } | null>(null); // v4.3: Detected YouTube URL from clipboard
  const [primaryTvId, setPrimaryTvId] = useState<string | null>(null); // v5.0: Current primary TV ID
  const [connectedTvIds, setConnectedTvIds] = useState<string[]>([]); // v5.0: List of connected TV IDs
  const [settingPrimaryTv, setSettingPrimaryTv] = useState(false); // v5.0: Loading state
  
  // Foreground Playback - Music Queue
  // Type for music queue items (matches favorites API response structure)
  type MusicQueueItem = {
    id: string;
    title?: string;
    title_display?: string;
    artist?: string | null;
    artist_name?: string | null;
    youtube_url?: string | null;
    source_type?: 'youtube' | 'database';
  };
  const [musicQueue, setMusicQueue] = useState<MusicQueueItem[]>([]);
  const [currentPlayingIndex, setCurrentPlayingIndex] = useState<number | null>(null);
  const [isPlayingMusic, setIsPlayingMusic] = useState(false);
  
  // v4.8.0: Real-time subscription state
  const [useRealtime, setUseRealtime] = useState(true);
  
  const roomIdRef = useRef<string | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const approvalCheckIntervalRef = useRef<NodeJS.Timeout | null>(null); // Polling for approval status
  const realtimeChannelRef = useRef<RealtimeChannel | null>(null); // v4.8.0: Real-time channel
  const reconnectAttemptsRef = useRef(0); // v4.8.0: Reconnection attempts counter
  const hasCheckedNameRef = useRef(false); // Fix: Prevent double execution in React Strict Mode
  
  // Foreground Playback - Player refs
  const favoritePlayerRef = useRef<any>(null);
  const favoritePlayerContainerRef = useRef<HTMLDivElement>(null);
  const isPlayingMusicRef = useRef(false);
  const currentPlaybackTimeRef = useRef(0);
  const playRetryCountRef = useRef(0);
  
  // Android Debug Panel - Show console logs on screen
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const [showDebugPanel, setShowDebugPanel] = useState(false);
  const debugLogsRef = useRef<string[]>([]);
  
  // v4.8.0: Real-time constants
  const MAX_RECONNECT_ATTEMPTS = 5;
  const RECONNECT_DELAY_MS = 5000; // 5 seconds between reconnection attempts
  const FALLBACK_POLLING_INTERVAL = 7500; // 7.5 seconds (slower polling for fallback)
  
  // Android Debug: Intercept console.log/error for on-screen display
  useEffect(() => {
    if (!isAndroid()) return;
    
    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;
    
    const addLog = (type: 'log' | 'error' | 'warn', ...args: any[]) => {
      const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
      ).join(' ');
      const timestamp = new Date().toLocaleTimeString();
      const logEntry = `[${timestamp}] [${type.toUpperCase()}] ${message}`;
      
      debugLogsRef.current = [...debugLogsRef.current.slice(-49), logEntry]; // Keep last 50 logs
      setDebugLogs([...debugLogsRef.current]);
    };
    
    console.log = (...args: any[]) => {
      originalLog(...args);
      addLog('log', ...args);
    };
    
    console.error = (...args: any[]) => {
      originalError(...args);
      addLog('error', ...args);
    };
    
    console.warn = (...args: any[]) => {
      originalWarn(...args);
      addLog('warn', ...args);
    };
    
    return () => {
      console.log = originalLog;
      console.error = originalError;
      console.warn = originalWarn;
    };
  }, []);
  
  // Toast notifications
  const { success, error: showError, ToastContainer } = useToast();
  
  // Preview management (single preview at a time)
  const { activePreviewId, setActivePreview } = usePreview();

  /**
   * Stop all polling and real-time subscriptions (cleanup on room expiry)
   */
  const stopAllUpdates = useCallback(() => {
    console.log('[room] Stopping all updates (room expired)');
    
    // Stop polling
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
      console.log('[room] Polling stopped');
    }
    
    // Unsubscribe from real-time
    if (realtimeChannelRef.current) {
      supabase.removeChannel(realtimeChannelRef.current);
      realtimeChannelRef.current = null;
      console.log('[room] Real-time subscription stopped');
    }
    
    // Clear room ID to prevent further polling attempts
    roomIdRef.current = null;
  }, []);

  /**
   * Refresh room state from backend (canonical source of truth)
   * Gets queue (ledger order) + upNext (turn order) + currentSong from backend
   * No local queue math - backend is single source of truth
   */
  const refreshRoomState = useCallback(async (roomId: string) => {
    try {
      // Phase 2.1: Pass userId for activity tracking
      const state = await api.getRoomState(roomId, user?.id);
      setRoom(state.room);
      setQueue(state.queue); // Ledger order (all pending items, by position)
      setUpNext(state.upNext); // Turn order (next to play via round-robin, read-only, informational)
      setCurrentSong(state.currentSong); // Currently playing (if any)
      // v5.0: Update primary TV ID and connected TVs state
      setPrimaryTvId(state.room.primary_tv_id || null);
      // Parse connected_tv_ids JSONB array
      const connectedTvs = (state.room as any).connected_tv_ids;
      let parsedTvIds: string[] = [];
      if (Array.isArray(connectedTvs)) {
        parsedTvIds = connectedTvs;
        setConnectedTvIds(parsedTvIds);
      } else if (connectedTvs) {
        // Handle JSONB format
        try {
          const parsed = typeof connectedTvs === 'string' ? JSON.parse(connectedTvs) : connectedTvs;
          parsedTvIds = Array.isArray(parsed) ? parsed : [];
          setConnectedTvIds(parsedTvIds);
        } catch {
          setConnectedTvIds([]);
        }
      } else {
        setConnectedTvIds([]);
      }
      console.log('[room] refreshRoomState done - queue:', state.queue.length, 'upNext:', state.upNext?.song?.title || 'none', 'current:', state.currentSong?.song?.title || 'none', 'connected TVs:', parsedTvIds.length);
    } catch (err: any) {
      console.error('[room] Failed to refresh room state:', err);
      // Phase 1: Check if it's a room expiry error (410 or 404)
      const isRoomExpired = err.status === 410 || err.status === 404;
      if (isRoomExpired) {
        // Stop all polling and real-time subscriptions to prevent repeated 410 errors
        stopAllUpdates();
        
        setError('Room expired or doesn\'t exist.');
        setShowGoHomeButton(true);
        setRoom(null);
        setCurrentSong(null);
      } else {
        // Real app error - preserve original message for troubleshooting
        setError(err.message || 'Failed to refresh room state');
      }
    }
  }, [user?.id, stopAllUpdates]);

  /**
   * v4.8.0: Subscribe to real-time updates for room and queue
   */
  const subscribeToRoom = useCallback((roomId: string) => {
    // Unsubscribe from previous channel if exists
    if (realtimeChannelRef.current) {
      console.log('[room] Unsubscribing from previous real-time channel');
      supabase.removeChannel(realtimeChannelRef.current);
      realtimeChannelRef.current = null;
    }

    console.log('[room] Setting up real-time subscription for room:', roomId);
    
    const channel = supabase
      .channel(`room-${roomId}`)
      // Subscribe to room metadata changes
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'kara_rooms',
          filter: `id=eq.${roomId}`
        },
        (payload) => {
          console.log('[room] Real-time: Room updated', payload);
          refreshRoomState(roomId);
        }
      )
      // Subscribe to queue changes (INSERT, UPDATE, DELETE)
      .on(
        'postgres_changes',
        {
          event: '*', // All events
          schema: 'public',
          table: 'kara_queue',
          filter: `room_id=eq.${roomId}`
        },
        (payload) => {
          console.log('[room] Real-time: Queue updated', payload.eventType, payload);
          refreshRoomState(roomId);
        }
      )
      .subscribe((status) => {
        console.log('[room] Real-time subscription status:', status);
        
        if (status === 'SUBSCRIBED') {
          console.log('[room] ✅ Real-time connected');
          // Stop any fallback polling if it was running
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
          }
          // Reset reconnect attempts on successful connection
          reconnectAttemptsRef.current = 0;
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error('[room] ❌ Real-time connection failed');
          // Attempt reconnection with retry logic
          attemptRealtimeReconnect(roomId);
        }
      });
    
    realtimeChannelRef.current = channel;
  }, [refreshRoomState]);

  /**
   * v4.8.0: Attempt real-time reconnection with retry logic
   */
  const attemptRealtimeReconnect = useCallback((roomId: string) => {
    reconnectAttemptsRef.current += 1;
    
    if (reconnectAttemptsRef.current > MAX_RECONNECT_ATTEMPTS) {
      console.error('[room] Max reconnection attempts reached. Falling back to polling.');
      // After 5 retries, gracefully degrade to slower polling
      setUseRealtime(false);
      startPolling(roomId, FALLBACK_POLLING_INTERVAL);
      showError('Using slower updates. Refresh page for better experience.');
      return;
    }
    
    console.log(`[room] Attempting real-time reconnection (${reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS})`);
    
    setTimeout(() => {
      // Clean up old channel
      if (realtimeChannelRef.current) {
        supabase.removeChannel(realtimeChannelRef.current);
        realtimeChannelRef.current = null;
      }
      
      // Retry real-time subscription
      subscribeToRoom(roomId);
    }, RECONNECT_DELAY_MS);
  }, [subscribeToRoom, showError]);

  /**
   * Start polling room state (fallback mode)
   * v4.8.0: Updated to accept custom interval parameter
   */
  const startPolling = useCallback((roomId: string, interval: number = FALLBACK_POLLING_INTERVAL) => {
    // Stop any existing polling
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    
    console.log(`[room] Starting polling fallback (${interval}ms interval)`);
    
    // Initial fetch
    refreshRoomState(roomId);
    
    // Start polling with specified interval
    pollingIntervalRef.current = setInterval(() => {
      const currentRoomId = roomIdRef.current;
      if (currentRoomId) {
        console.log('[room] Polling refreshRoomState');
        refreshRoomState(currentRoomId);
      }
    }, interval);
  }, [refreshRoomState]);

  /**
   * Check user's approval status in room
   */
  const checkApprovalStatus = useCallback(async (roomId: string, userId: string) => {
    try {
      const statusData = await api.getUserStatus(roomId, userId);
      setUserApprovalStatus(statusData.status);
      console.log('[room] User approval status:', statusData.status);
      return statusData.status;
    } catch (err: any) {
      console.error('[room] Failed to check approval status:', err);
      return null;
    }
  }, []);

  /**
   * Start polling approval status (for pending users)
   */
  const startApprovalPolling = useCallback((roomId: string, userId: string) => {
    if (approvalCheckIntervalRef.current) {
      return;
    }
    
    console.log('[room] Starting approval status polling');
    approvalCheckIntervalRef.current = setInterval(async () => {
      const status = await checkApprovalStatus(roomId, userId);
      // Stop polling if approved or denied
      if (status === 'approved' || status === 'denied') {
        if (approvalCheckIntervalRef.current) {
          clearInterval(approvalCheckIntervalRef.current);
          approvalCheckIntervalRef.current = null;
        }
      }
    }, 3000); // Check every 3 seconds
  }, [checkApprovalStatus]);

  const joinRoom = useCallback(async (displayName: string) => {
    try {
      const fingerprint = getOrCreateFingerprint();
      
      const { room: roomData, user: userData } = await api.joinRoom({
        room_code: code.toUpperCase(),
        user_fingerprint: fingerprint,
        display_name: displayName,
      });

      setRoom(roomData);
      setUser(userData);
      
      // Check if user is host
      const isUserHost = roomData.host_id === userData.id;
      setIsHost(isUserHost);
      console.log('[Room] User is host:', isUserHost);
      
      // Check approval status (v4.0)
      if (!isUserHost && appConfig.features.hostApproval) {
        const status = await checkApprovalStatus(roomData.id, userData.id);
        if (status === 'pending') {
          // Start polling for approval updates
          startApprovalPolling(roomData.id, userData.id);
        }
      } else {
        // Host is always approved
        setUserApprovalStatus('approved');
      }
      
      // Ensure display name is stored (backend might have updated it)
      if (userData.display_name) {
        localStorage.setItem('user_display_name', userData.display_name);
      }

      // Store room context for share-target (PWA YouTube sharing)
      localStorage.setItem('current_room_id', roomData.id);
      localStorage.setItem('current_room_code', roomData.room_code);
      localStorage.setItem('user_id', userData.id);
      localStorage.setItem('user_role', isUserHost ? 'host' : 'user');
      console.log('[Room] Saved room context to localStorage for share-target');

      roomIdRef.current = roomData.id;
      
      // Initial load of room state
      await refreshRoomState(roomData.id);

      // v4.8.0: Start real-time subscription (or fallback to polling)
      if (useRealtime) {
        subscribeToRoom(roomData.id);
      } else {
        startPolling(roomData.id, FALLBACK_POLLING_INTERVAL);
      }
    } catch (err: any) {
      // Phase 1: Check if it's a room expiry error (410 or 404)
      const isRoomExpired = err.status === 410 || err.status === 404;
      if (isRoomExpired) {
        setError('Room expired or doesn\'t exist.');
        setShowGoHomeButton(true);
      } else {
        // Real app error - preserve original message for troubleshooting
        setError(err.message || 'Failed to join room');
      }
    } finally {
      setLoading(false);
    }
  }, [code, refreshRoomState, subscribeToRoom, startPolling, useRealtime]);

  const handleNameConfirm = useCallback((name: string) => {
    // Store name in localStorage
    localStorage.setItem('user_display_name', name);
    setShowNameInput(false);
    setLoading(true);
    // Join room with the entered name
    joinRoom(name);
  }, [joinRoom]);

  // Check if user is host and auto-join, otherwise show name input
  useEffect(() => {
    // Fix: Prevent duplicate processing (React 18 Strict Mode calls useEffect twice)
    if (hasCheckedNameRef.current) {
      console.log('[Room] Already checked name, skipping');
      return;
    }
    
    if (code) {
      hasCheckedNameRef.current = true; // Mark as processed
      
      const checkNameAndJoin = async () => {
        const userRole = localStorage.getItem('user_role');
        // Fix: Check both keys for backward compatibility (user_display_name is correct, user_name is legacy)
        let storedName = localStorage.getItem('user_display_name') 
          || localStorage.getItem('user_name'); // Fallback to old key
        const storedRoomCode = localStorage.getItem('current_room_code');
        
        // Check if user is already in THIS specific room
        const alreadyInThisRoom = storedRoomCode?.toUpperCase() === code.toUpperCase();
        
        // Option B: If no name in localStorage, check database (future-proof for v5.0 auth)
        // COST OPTIMIZATION: Use client-side Supabase directly (no serverless function invocation)
        if (!storedName) {
          try {
            const fingerprint = getOrCreateFingerprint();
            console.log('[Room] No name in localStorage, checking database for fingerprint:', fingerprint);
            
            // Direct client-side query (no Vercel invocation) - cost optimized
            const { data: dbUser, error } = await supabase
              .from('kara_users')
              .select('id, display_name, fingerprint')
              .eq('fingerprint', fingerprint)
              .single();
            
            if (!error && dbUser?.display_name) {
              storedName = dbUser.display_name;
              // Store in localStorage for future use
              if (storedName) {
                localStorage.setItem('user_display_name', storedName);
                console.log('[Room] Found name in database:', storedName);
              }
            }
          } catch (err) {
            console.warn('[Room] Failed to check database for user name:', err);
            // Continue to show modal if DB check fails
          }
        }
        
        // Auto-join if user has a stored name (from localStorage, join page, or database)
        // This allows:
        // 1. Hosts to auto-join (name provided during room creation)
        // 2. Users returning to same room (from share-target, etc.)
        // 3. Users rejoining after leaving (name stored from join page)
        // 4. Returning users (name found in database, even if localStorage cleared)
        if (storedName) {
          console.log('[Room] Auto-joining with stored name:', storedName, '(role:', userRole, ', alreadyInRoom:', alreadyInThisRoom, ')');
          setLoading(true);
          joinRoom(storedName);
        } else {
          // First-time users need to provide their name (no stored name found in localStorage or DB)
          console.log('[Room] First visit, showing name input');
          setShowNameInput(true);
          setLoading(false);
        }
      };
      
      checkNameAndJoin();
    }
    
    // Cleanup on unmount
    return () => {
      // Fix: Reset name check guard on unmount (allows re-checking if component remounts)
      hasCheckedNameRef.current = false;
      
      // v4.8.0: Cleanup polling
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
      
      // v4.8.0: Cleanup real-time
      if (realtimeChannelRef.current) {
        supabase.removeChannel(realtimeChannelRef.current);
        realtimeChannelRef.current = null;
      }
      
      // v4.8.0: Reset reconnect attempts
      reconnectAttemptsRef.current = 0;
    };
  }, [code, joinRoom]);

  // Fetch favorites
  const fetchFavorites = useCallback(async () => {
    if (!user) return;
    
    setFavoritesLoading(true);
    try {
      const { favorites: favoritesData } = await api.getUserFavorites(user.id);
      setFavorites(favoritesData || []);
      // Update favoriteSongIds set
      const favoriteIds = new Set(favoritesData.map((song: Song) => song.id));
      setFavoriteSongIds(favoriteIds);
    } catch (error) {
      console.error('Failed to fetch favorites:', error);
      showError('Failed to load favorites');
    } finally {
      setFavoritesLoading(false);
    }
  }, [user, showError]);

  // Toggle favorite status for a song
  const toggleFavorite = useCallback(async (songId: string) => {
    if (!user) return;
    
    try {
      const isFavorite = favoriteSongIds.has(songId);
      
      if (isFavorite) {
        // Remove from favorites
        await api.removeFavorite(user.id, songId);
        setFavoriteSongIds(prev => {
          const next = new Set(prev);
          next.delete(songId);
          return next;
        });
        setFavorites(prev => prev.filter(song => song.id !== songId));
        success('Removed from favorites');
      } else {
        // Add to favorites
        await api.addFavorite(user.id, songId);
        setFavoriteSongIds(prev => new Set(prev).add(songId));
        success('Added to favorites');
      }
    } catch (error) {
      console.error('Failed to toggle favorite:', error);
      showError('Failed to update favorite');
    }
  }, [user, favoriteSongIds, success, showError]);

  // ====================================
  // FOREGROUND PLAYBACK - MUSIC QUEUE
  // ====================================

  // Add song to music queue
  const addToMusicQueue = useCallback((song: MusicQueueItem) => {
    setMusicQueue(prev => [...prev, song]);
    success('Added to Music Queue');
  }, [success]);

  // Remove from music queue
  const removeFromMusicQueue = useCallback((index: number) => {
    setMusicQueue(prev => prev.filter((_, i) => i !== index));
    // If removing current song, stop playback
    if (currentPlayingIndex === index) {
      setIsPlayingMusic(false);
      isPlayingMusicRef.current = false;
      setCurrentPlayingIndex(null);
    } else if (currentPlayingIndex !== null && currentPlayingIndex > index) {
      // Adjust current index if song before it was removed
      setCurrentPlayingIndex(prev => (prev !== null ? prev - 1 : null));
    }
  }, [currentPlayingIndex]);

  // Reorder music queue
  const reorderMusicQueue = useCallback((fromIndex: number, toIndex: number) => {
    setMusicQueue(prev => {
      const newQueue = [...prev];
      const [removed] = newQueue.splice(fromIndex, 1);
      newQueue.splice(toIndex, 0, removed);
      return newQueue;
    });
    // Adjust current index if needed
    if (currentPlayingIndex !== null) {
      if (fromIndex === currentPlayingIndex) {
        setCurrentPlayingIndex(toIndex);
      } else if (fromIndex < currentPlayingIndex && toIndex >= currentPlayingIndex) {
        setCurrentPlayingIndex(prev => (prev !== null ? prev - 1 : null));
      } else if (fromIndex > currentPlayingIndex && toIndex <= currentPlayingIndex) {
        setCurrentPlayingIndex(prev => (prev !== null ? prev + 1 : null));
      }
    }
  }, [currentPlayingIndex]);

  // Start playing music queue
  const playMusicQueue = useCallback(() => {
    if (musicQueue.length === 0) {
      showError('Music queue is empty');
      return;
    }
    
    playRetryCountRef.current = 0;
    currentPlaybackTimeRef.current = 0;
    
    // Android: Ensure container is visible before setting playing index
    if (isAndroid() && favoritePlayerContainerRef.current) {
      favoritePlayerContainerRef.current.style.display = 'block';
      favoritePlayerContainerRef.current.style.visibility = 'visible';
      favoritePlayerContainerRef.current.style.opacity = '1';
      // Force a reflow to ensure styles are applied
      favoritePlayerContainerRef.current.offsetHeight;
    }
    
    setCurrentPlayingIndex(0);
    setIsPlayingMusic(true);
    isPlayingMusicRef.current = true;
  }, [musicQueue, showError]);

  // Pause music playback
  const pauseMusicPlayback = useCallback(() => {
    if (favoritePlayerRef.current) {
      favoritePlayerRef.current.pauseVideo();
      setIsPlayingMusic(false);
      isPlayingMusicRef.current = false;
    }
  }, []);

  // Resume music playback
  const resumeMusicPlayback = useCallback(() => {
    if (favoritePlayerRef.current && currentPlayingIndex !== null) {
      setIsPlayingMusic(true);
      isPlayingMusicRef.current = true;
      favoritePlayerRef.current.playVideo();
    }
  }, [currentPlayingIndex]);

  // Play next song in music queue
  const playNextInMusicQueue = useCallback(() => {
    if (currentPlayingIndex === null || currentPlayingIndex >= musicQueue.length - 1) {
      setIsPlayingMusic(false);
      isPlayingMusicRef.current = false;
      setCurrentPlayingIndex(null);
      success('Music queue finished');
      return;
    }
    setCurrentPlayingIndex(prev => (prev !== null ? prev + 1 : 0));
    currentPlaybackTimeRef.current = 0;
  }, [currentPlayingIndex, musicQueue.length, success]);

  // Clear music queue
  const clearMusicQueue = useCallback(() => {
    setMusicQueue([]);
    setCurrentPlayingIndex(null);
    setIsPlayingMusic(false);
    isPlayingMusicRef.current = false;
    if (favoritePlayerRef.current) {
      favoritePlayerRef.current.stopVideo();
    }
    success('Music queue cleared');
  }, [success]);

  // Player event handlers
  const handleMusicPlayerReady = useCallback((event?: any) => {
    // event.target is the player instance (from YouTubePlayer component)
    if (event && event.target) {
      favoritePlayerRef.current = event.target;
      console.log('[Music Queue] Player ready');
      
      // Android: Longer delay, ensure container is visible
      const delay = isAndroid() ? 1500 : isIOS() ? 500 : 300;
      
      setTimeout(() => {
        if (favoritePlayerRef.current && isPlayingMusicRef.current) {
          // Android: Triple-check container visibility and ensure it's in viewport
          if (isAndroid() && favoritePlayerContainerRef.current) {
            const rect = favoritePlayerContainerRef.current.getBoundingClientRect();
            const isVisible = rect.width > 0 && rect.height > 0 && 
                            rect.top >= 0 && rect.left >= 0 &&
                            rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
                            rect.right <= (window.innerWidth || document.documentElement.clientWidth);
            
            if (!isVisible) {
              console.warn('[Music Queue] Container not properly visible on Android, forcing visibility and retrying...');
              // Force container to be visible
              favoritePlayerContainerRef.current.style.display = 'block';
              favoritePlayerContainerRef.current.style.visibility = 'visible';
              favoritePlayerContainerRef.current.style.opacity = '1';
              favoritePlayerContainerRef.current.style.position = 'relative';
              favoritePlayerContainerRef.current.style.zIndex = '1000';
              
              setTimeout(() => {
                if (favoritePlayerRef.current && isPlayingMusicRef.current) {
                  try {
                    favoritePlayerRef.current.playVideo();
                  } catch (err) {
                    console.error('[Music Queue] Retry play error:', err);
                  }
                }
              }, 1000);
              return;
            }
            
            console.log('[Music Queue] Android container verified visible:', {
              width: rect.width,
              height: rect.height,
              top: rect.top,
              left: rect.left,
              origin: window.location.origin
            });
          }
          
          try {
            // Restore playback time if resuming
            if (currentPlaybackTimeRef.current > 0) {
              favoritePlayerRef.current.seekTo(currentPlaybackTimeRef.current, true);
            }
            favoritePlayerRef.current.playVideo();
          } catch (err) {
            console.error('[Music Queue] Play error:', err);
          }
        }
      }, delay);
    }
  }, []);

  const handleMusicPlayerEnded = useCallback(() => {
    console.log('[Music Queue] Song ended, playing next');
    playNextInMusicQueue();
  }, [playNextInMusicQueue]);

  const handleMusicPlayerStateChange = useCallback((state: number) => {
    // Save playback time for state persistence (PLAYING = 1)
    if (favoritePlayerRef.current && state === 1) {
      try {
        const currentTime = favoritePlayerRef.current.getCurrentTime();
        if (typeof currentTime === 'number' && currentTime > 0) {
          currentPlaybackTimeRef.current = currentTime;
        }
      } catch (err) {
        // Ignore errors getting time
      }
    }
  }, []);

  const handleMusicPlayerError = useCallback((errorCode: number) => {
    console.error('[Music Queue] YouTube error:', errorCode);
    
    let errorMsg = 'Unknown error';
    switch (errorCode) {
      case 2:
        errorMsg = 'Invalid video ID';
        break;
      case 5:
        errorMsg = 'HTML5 player error';
        break;
      case 100:
        errorMsg = 'Video not found or deleted';
        break;
      case 101:
      case 150:
        errorMsg = 'Video not allowed to be played in embedded players';
        break;
    }
    
    // For Android embedding errors, log but continue
    if (isAndroid() && (errorCode === 101 || errorCode === 150)) {
      console.error('[Music Queue] Android embedding error - video may be restricted');
    }
    
    // Skip to next song
    showError(`Unable to play song: ${errorMsg}. Skipping to next...`);
    playNextInMusicQueue();
  }, [playNextInMusicQueue, showError]);

  // Fetch history when history tab is activated
  // v4.5.2: Fetch user-global history (not room-specific)
  const fetchHistory = useCallback(async () => {
    if (!user) return;
    
    setHistoryLoading(true);
    try {
      // Fetch both history and favorites (user-global)
      const [{ history: historyData }, { favorites: favoritesData }] = await Promise.all([
        api.getUserHistory(user.id), // No room filter - user-global
        api.getUserFavorites(user.id),
      ]);
      setHistory(historyData || []);
      console.log('[Room] Fetched user-global history:', historyData.length, 'entries');
      // Update favoriteSongIds for heart icon display
      const favoriteIds = new Set(favoritesData.map((song: Song) => song.id));
      setFavoriteSongIds(favoriteIds);
    } catch (error) {
      console.error('Failed to fetch history:', error);
      showError('Failed to load history');
    } finally {
      setHistoryLoading(false);
    }
  }, [user, showError]);

  const handleSearch = async () => {
    if (!room) return;

    // Require search query - don't allow empty search
    const trimmedQuery = searchQuery.trim();
    if (!trimmedQuery) {
      setError('Please enter a search term (at least 2 characters)');
      setSearchResults([]);
      return;
    }

    // Require minimum 2 characters
    if (trimmedQuery.length < 2) {
      setError('Please enter at least 2 characters to search');
      setSearchResults([]);
      return;
    }

    setSearching(true);
    setError('');
    try {
      console.log('[YouTube Search] Searching with query:', trimmedQuery);
      
      // NEW: Call search-versions API (flat version list)
      const response = await fetch(`/api/songs/search-versions?q=${encodeURIComponent(trimmedQuery)}&limit=50`);
      
      if (!response.ok) {
        throw new Error('Search failed');
      }

      const data: VersionSearchResponse = await response.json();
      console.log('[YouTube Search] Found', data.results.length, 'versions');
      
      // Sort: Exact matches first, then alphabetically
      const queryLower = trimmedQuery.toLowerCase();
      const sortedResults = data.results.sort((a, b) => {
        const titleA = a.song_title.toLowerCase();
        const titleB = b.song_title.toLowerCase();
        
        // Check exact match (starts with query)
        const aExact = titleA.startsWith(queryLower);
        const bExact = titleB.startsWith(queryLower);
        
        if (aExact && !bExact) return -1; // a first
        if (!aExact && bExact) return 1;  // b first
        
        // Both exact or both not exact - alphabetical
        return titleA.localeCompare(titleB);
      });
      
      setSearchResults(sortedResults);
      
      if (sortedResults.length === 0) {
        setError('No songs found. Try a different search term.');
      }
    } catch (err: any) {
      console.error('[YouTube Search] Search error:', err);
      setError(err.message || 'Failed to search songs');
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  /**
   * YouTube-style search: Add version directly to queue (no modal)
   * Used by VersionCard component
   */
  const handleAddVersionToQueue = async (versionId: string) => {
    if (!room || !user) {
      console.error('[handleAddVersionToQueue] Missing room or user');
      setError('Room or user not found. Please refresh the page.');
      return;
    }

    setAddingToQueue(true);
    try {
      console.log('[handleAddVersionToQueue] Adding version to queue:', { 
        room_id: room.id, 
        user_id: user.id, 
        version_id: versionId
      });

      await api.addToQueue({
        room_id: room.id,
        version_id: versionId,
        user_id: user.id,
      });

      setError('');
      success('Song added to queue!');
      // Stop any active preview
      setActivePreview(null);
    } catch (err: any) {
      console.error('[handleAddVersionToQueue] Failed:', err);
      const errorMessage = err.message || 'Failed to add song to queue';
      setError(errorMessage);
      showError(errorMessage);
    } finally {
      setAddingToQueue(false);
    }
  };

  /**
   * Add YouTube video to queue (helper that accepts URL parameter)
   */
  const handleAddYouTubeUrlFromString = async (url: string) => {
    if (!room || !user) {
      setError('Room or user not found. Please refresh the page.');
      return;
    }

    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
      showError('Invalid YouTube URL');
      return;
    }

    // Extract video ID from various YouTube URL formats
    let videoId = '';
    try {
      const urlObj = new URL(trimmedUrl);
      
      // youtube.com/watch?v=VIDEO_ID
      if (urlObj.hostname.includes('youtube.com') && urlObj.searchParams.has('v')) {
        videoId = urlObj.searchParams.get('v') || '';
      }
      // youtu.be/VIDEO_ID
      else if (urlObj.hostname === 'youtu.be') {
        videoId = urlObj.pathname.slice(1); // Remove leading slash
      }
      
      if (!videoId) {
        showError('Invalid YouTube URL format');
        return;
      }
    } catch (err) {
      showError('Invalid URL format');
      return;
    }

    setAddingYoutube(true);
    try {
      await api.addYouTubeToQueue({
        room_id: room.id,
        user_id: user.id,
        youtube_url: `https://www.youtube.com/watch?v=${videoId}`,
        title: '', // Backend will fetch title
      });

      setError('');
      success('YouTube video added to queue!');
    } catch (err: any) {
      console.error('[handleAddYouTubeUrlFromString] Failed:', err);
      const errorMessage = err.message || 'Failed to add YouTube video to queue';
      setError(errorMessage);
      showError(errorMessage);
    } finally {
      setAddingYoutube(false);
    }
  };

  /**
   * Detect YouTube URL from clipboard and show smart paste toast (v4.3)
   */
  const handleClipboardDetection = async () => {
    try {
      // Read clipboard
      const clipboardText = await navigator.clipboard.readText();
      
      if (!clipboardText || !clipboardText.trim()) {
        return;
      }
      
      // Check if it's a YouTube URL
      try {
        const urlObj = new URL(clipboardText.trim());
        const isYouTube = (
          urlObj.hostname.includes('youtube.com') ||
          urlObj.hostname === 'youtu.be'
        );
        
        if (!isYouTube) {
          return;
        }
        
        console.log('[handleClipboardDetection] YouTube URL detected:', clipboardText);
        
        // Fetch video metadata using oEmbed API
        const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(clipboardText.trim())}&format=json`;
        const response = await fetch(oembedUrl);
        
        if (response.ok) {
          const data = await response.json();
          const title = data.title || 'YouTube Video';
          
          // Show toast with video title
          setClipboardYouTube({
            url: clipboardText.trim(),
            title,
          });
          
          // Auto-dismiss after 8 seconds
          setTimeout(() => {
            setClipboardYouTube(null);
          }, 8000);
          
          console.log('[handleClipboardDetection] Fetched title:', title);
        } else {
          // Failed to fetch metadata, show generic toast
          setClipboardYouTube({
            url: clipboardText.trim(),
            title: 'YouTube Video',
          });
          
          setTimeout(() => {
            setClipboardYouTube(null);
          }, 8000);
        }
      } catch (urlError) {
        // Not a valid URL, ignore
        return;
      }
    } catch (err) {
      // Clipboard permission denied or error, ignore silently
      console.log('[handleClipboardDetection] Clipboard access denied or error');
    }
  };

  /**
   * Handle paste event to detect YouTube URLs (v4.3 - iOS fallback)
   */
  const handlePaste = async (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pastedText = e.clipboardData.getData('text');
    
    if (!pastedText || !pastedText.trim()) {
      return;
    }
    
    // Check if it's a YouTube URL
    try {
      const urlObj = new URL(pastedText.trim());
      const isYouTube = (
        urlObj.hostname.includes('youtube.com') ||
        urlObj.hostname === 'youtu.be'
      );
      
      if (!isYouTube) {
        return;
      }
      
      console.log('[handlePaste] YouTube URL detected:', pastedText);
      
      // Prevent default paste to avoid filling input
      e.preventDefault();
      
      // Fetch video metadata using oEmbed API
      const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(pastedText.trim())}&format=json`;
      const response = await fetch(oembedUrl);
      
      if (response.ok) {
        const data = await response.json();
        const title = data.title || 'YouTube Video';
        
        // Show toast with video title
        setClipboardYouTube({
          url: pastedText.trim(),
          title,
        });
        
        // Auto-dismiss after 8 seconds
        setTimeout(() => {
          setClipboardYouTube(null);
        }, 8000);
        
        console.log('[handlePaste] Fetched title:', title);
      } else {
        // Failed to fetch metadata, show generic toast
        setClipboardYouTube({
          url: pastedText.trim(),
          title: 'YouTube Video',
        });
        
        setTimeout(() => {
          setClipboardYouTube(null);
        }, 8000);
      }
    } catch (urlError) {
      // Not a valid URL, allow default paste
      return;
    }
  };

  /**
   * Add YouTube video to queue via direct URL paste
   */
  const handleAddYouTubeUrl = async () => {
    if (!room || !user) {
      setError('Room or user not found. Please refresh the page.');
      return;
    }

    const trimmedUrl = youtubeUrl.trim();
    if (!trimmedUrl) {
      showError('Please paste a YouTube URL');
      return;
    }

    // Extract video ID from various YouTube URL formats
    let videoId = '';
    try {
      const url = new URL(trimmedUrl);
      
      // youtube.com/watch?v=VIDEO_ID
      if (url.hostname.includes('youtube.com') && url.searchParams.has('v')) {
        videoId = url.searchParams.get('v') || '';
      }
      // youtu.be/VIDEO_ID
      else if (url.hostname === 'youtu.be') {
        videoId = url.pathname.slice(1); // Remove leading slash
      }
      
      if (!videoId) {
        showError('Invalid YouTube URL. Please use a valid youtube.com or youtu.be link.');
        return;
      }
    } catch (err) {
      showError('Invalid URL format. Please paste a valid YouTube link.');
      return;
    }

    setAddingYoutube(true);
    try {
      console.log('[handleAddYouTubeUrl] Adding YouTube video:', { 
        room_id: room.id, 
        user_id: user.id, 
        videoId,
        url: trimmedUrl
      });

      await api.addYouTubeToQueue({
        room_id: room.id,
        user_id: user.id,
        youtube_url: `https://www.youtube.com/watch?v=${videoId}`,
        title: '', // Backend will fetch title
      });

      setError('');
      success('YouTube video added to queue!');
      setYoutubeUrl(''); // Clear input
    } catch (err: any) {
      console.error('[handleAddYouTubeUrl] Failed:', err);
      const errorMessage = err.message || 'Failed to add YouTube video to queue';
      setError(errorMessage);
      showError(errorMessage);
    } finally {
      setAddingYoutube(false);
    }
  };

  // OLD: Group-based search handler (kept for History/Favorites)
  const handleAddToQueue = async (group: SongGroupResult, versionId?: string) => {
    console.log('[handleAddToQueue] Called with:', { 
      group_id: group.group_id, 
      display_title: group.display_title,
      versionId,
      best_version: group.best_version,
      room: !!room,
      user: !!user
    });

    if (!room || !user) {
      console.error('[handleAddToQueue] Missing room or user:', { room: !!room, user: !!user });
      setError('Room or user not found. Please refresh the page.');
      return;
    }

    try {
      // Use provided version_id or best_version
      const targetVersionId = versionId || (group.best_version && group.best_version.version_id);
      
      if (!targetVersionId) {
        console.error('[handleAddToQueue] No version_id available:', { 
          versionId, 
          best_version: group.best_version,
          group_id: group.group_id,
          available_versions: group.available.version_count
        });
        setError('No version available for this song. Please select a version.');
        return;
      }

      console.log('[handleAddToQueue] Adding to queue:', { 
        room_id: room.id, 
        user_id: user.id, 
        version_id: targetVersionId,
        group_title: group.display_title
      });
      
      setAddingToQueue(true);
      
      // Use version_id (preferred) - API will map to song_id internally
      await api.addToQueue({
        room_id: room.id,
        version_id: targetVersionId,
        user_id: user.id,
      });

      setError('');
      // Show success toast
      success(`Added "${group.display_title}" to queue!`);
      // UI does NOTHING - waits for next poll (≤3s) to see change
      // Rule: No immediate refresh, no optimistic UI
    } catch (err: any) {
      console.error('[handleAddToQueue] Failed to add to queue:', err);
      const errorMessage = err.message || 'Failed to add song to queue';
      setError(errorMessage);
      showError(errorMessage);
    } finally {
      setAddingToQueue(false);
    }
  };

  const handleRemoveFromQueue = (queueItemId: string, songTitle: string) => {
    setPendingRemove({ id: queueItemId, title: songTitle });
    setShowConfirmRemove(true);
  };

  const confirmRemove = async () => {
    if (!user || !pendingRemove) {
      return;
    }

    setShowConfirmRemove(false);
    const { id, title } = pendingRemove;
    setPendingRemove(null);
    setRemovingFromQueue(true);

    try {
      console.log('[handleRemoveFromQueue] Removing:', { queueItemId: id, songTitle: title, userId: user.id });

      await api.removeQueueItem(id, user.id);

      // Show success toast
      success(`Removed "${title}" from queue`);
      // UI does NOTHING - waits for next poll to see change
      // Rule: No immediate refresh, no optimistic UI
    } catch (err: any) {
      console.error('[handleRemoveFromQueue] Failed to remove:', err);
      const errorMessage = err.message || 'Failed to remove song from queue';
      setError(errorMessage);
      showError(errorMessage);
    } finally {
      setRemovingFromQueue(false);
    }
  };

  const handleReorder = async (queueItemId: string, direction: 'up' | 'down') => {
    if (!user || !room) return;
    
    setReorderingId(queueItemId);
    
    try {
      await api.reorderQueueItem(queueItemId, direction, user.id, room.id);
      success(`Song moved ${direction === 'up' ? 'up' : 'down'}`);
      // UI will update on next poll (≤2.5s)
    } catch (err: any) {
      console.error('[handleReorder] Failed to reorder:', err);
      const errorMessage = err.message || 'Failed to reorder song';
      showError(errorMessage);
    } finally {
      setReorderingId(null);
    }
  };

  // Phase 2: Leave room handler
  const handleLeaveRoom = useCallback(async () => {
    if (!user || !room) return;

    if (!confirm('Are you sure you want to leave this room? You can rejoin anytime with the room code.')) {
      return;
    }

    try {
      await api.leaveRoom(room.id, user.id);
      
      // Clear localStorage
      localStorage.removeItem('current_room_id');
      localStorage.removeItem('current_room_code');
      localStorage.removeItem('user_role');
      
      // Redirect to join page
      window.location.href = '/join';
    } catch (err: any) {
      console.error('[handleLeaveRoom] Failed to leave room:', err);
      showError(err.message || 'Failed to leave room');
    }
  }, [user, room, showError]);

  // v5.0: Set primary TV (host-only, direct Supabase RPC - no API call)
  const handleSetPrimaryTV = useCallback(async (tvId: string) => {
    if (!room || !user || !isHost) {
      showError('Only host can change primary TV');
      return;
    }

    if (!tvId.trim()) {
      showError('Please select a TV');
      return;
    }

    setSettingPrimaryTv(true);
    try {
      // Call database function via Supabase RPC (cost-optimized, no Vercel invocation)
      const { data, error } = await supabase.rpc('set_primary_tv', {
        p_room_id: room.id,
        p_user_id: user.id,
        p_tv_id: tvId.trim()
      });

      if (error) {
        throw error;
      }

      if (data) {
        success('Primary TV updated successfully');
        // Real-time subscription will automatically update room state
        // Refresh room state to get updated primary_tv_id and connected TVs
        await refreshRoomState(room.id);
      } else {
        showError('Failed to update primary TV');
      }
    } catch (err: any) {
      console.error('[handleSetPrimaryTV] Failed:', err);
      showError(err.message || 'Failed to update primary TV');
    } finally {
      setSettingPrimaryTv(false);
    }
  }, [room, user, isHost, success, showError, refreshRoomState]);

  // Remove local queue math - backend is single source of truth
  // Calculate user queue count from backend state (no position calculations)
  const userQueueCount = queue.filter((item) => item.user_id === user?.id).length;
  
  // Filter queue to show only current user's songs
  const userQueue = queue.filter((item) => item.user_id === user?.id);

  // Show name input modal if needed
  if (showNameInput) {
    return (
      <NameInputModal
        onConfirm={handleNameConfirm}
        initialName={localStorage.getItem('user_display_name') || ''}
      />
    );
  }

  if (loading) {
    return (
      <div className="phone-mode" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div style={{ fontSize: '1.5rem' }}>Joining room...</div>
      </div>
    );
  }

  if (error && !room) {
    return (
      <div className="phone-mode" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', flexDirection: 'column', gap: '1rem', padding: '2rem', textAlign: 'center' }}>
        <div style={{ fontSize: '1.5rem', color: '#e00', marginBottom: '1rem' }}>{error}</div>
        {/* Phase 1: Show "Go Home" button for expired rooms */}
        {showGoHomeButton && (
          <a 
            href="/" 
            style={{
              display: 'inline-block',
              padding: '1rem 2rem',
              background: '#0070f3',
              color: 'white',
              textDecoration: 'none',
              borderRadius: '8px',
              fontSize: '1.1rem',
              fontWeight: 'bold',
              boxShadow: '0 4px 12px rgba(0, 112, 243, 0.3)',
              transition: 'all 0.3s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#0051cc';
              e.currentTarget.style.transform = 'scale(1.05)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#0070f3';
              e.currentTarget.style.transform = 'scale(1)';
            }}
          >
            Go Home
          </a>
        )}
      </div>
    );
  }

  if (!room || !user) {
    return null;
  }

  return (
    <div className="phone-mode">
      {/* Header */}
      <div style={{ background: '#0070f3', color: 'white', padding: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
              {room.room_name}
            </div>
            <div style={{ fontSize: '0.9rem', opacity: 0.9 }}>
              Room Code: <strong>{room.room_code}</strong>
            </div>
            {userQueueCount > 0 && (
              <div style={{ fontSize: '0.9rem', opacity: 0.9, marginTop: '0.5rem' }}>
                You have {userQueueCount} song{userQueueCount !== 1 ? 's' : ''} in queue
              </div>
            )}
          </div>
          {/* Phase 2: Leave Room Button */}
          <button
            onClick={handleLeaveRoom}
            style={{
              background: 'rgba(255, 255, 255, 0.2)',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              color: 'white',
              padding: '0.5rem 1rem',
              borderRadius: '6px',
              fontSize: '0.85rem',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              marginLeft: '1rem',
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
            }}
          >
            🚪 Leave Room
          </button>
        </div>
        
        {/* v5.0: Host-only TV Display Control */}
        {isHost && (
          <div style={{ 
            marginTop: '1rem', 
            padding: '0.75rem', 
            background: 'rgba(255, 255, 255, 0.15)', 
            borderRadius: '6px',
            border: '1px solid rgba(255, 255, 255, 0.2)'
          }}>
            <div style={{ fontSize: '0.85rem', marginBottom: '0.75rem', fontWeight: 'bold' }}>
              📺 TV Display Control
            </div>
            {connectedTvIds.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {connectedTvIds.map((tvId) => {
                  const isPrimary = tvId === primaryTvId;
                  return (
                    <div key={tvId} style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '0.5rem',
                      padding: '0.5rem',
                      background: 'rgba(255, 255, 255, 0.1)',
                      borderRadius: '4px',
                    }}>
                      <div style={{ flex: 1, fontSize: '0.8rem' }}>
                        {isPrimary ? '🔊 Primary Display' : '📺 Secondary Display'}
                      </div>
                      <select
                        value={isPrimary ? 'primary' : 'secondary'}
                        onChange={async (e) => {
                          const newMode = e.target.value;
                          if (newMode === (isPrimary ? 'primary' : 'secondary')) return;
                          
                          if (newMode === 'primary') {
                            // Set this TV as primary
                            await handleSetPrimaryTV(tvId);
                          } else {
                            // Switching to secondary: set first other TV as primary
                            const otherTv = connectedTvIds.find(id => id !== tvId);
                            if (otherTv) {
                              await handleSetPrimaryTV(otherTv);
                            } else {
                              showError('Cannot switch to secondary: No other TVs connected');
                            }
                          }
                        }}
                        style={{
                          padding: '0.4rem 0.6rem',
                          borderRadius: '4px',
                          border: '1px solid rgba(255, 255, 255, 0.3)',
                          background: 'rgba(255, 255, 255, 0.2)',
                          color: 'white',
                          fontSize: '0.8rem',
                          cursor: 'pointer',
                        }}
                      >
                        <option value="primary" style={{ color: '#333' }}>🔊 Primary</option>
                        <option value="secondary" style={{ color: '#333' }}>📺 Secondary</option>
                      </select>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ fontSize: '0.8rem', opacity: 0.8, fontStyle: 'italic' }}>
                No TVs connected yet. Connect a TV display to this room to see it here.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Approval Status Banner (v4.0) */}
      {userApprovalStatus === 'pending' && (
        <div style={{
          background: 'linear-gradient(135deg, #FFA500 0%, #FF8C00 100%)',
          color: 'white',
          padding: '1rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
        }}>
          <div style={{ fontSize: '1.5rem' }}>⏳</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 'bold', marginBottom: '0.25rem' }}>
              Waiting for Host Approval
            </div>
            <div style={{ fontSize: '0.85rem', opacity: 0.95 }}>
              The host will review your request shortly. You'll be able to add songs once approved.
            </div>
          </div>
        </div>
      )}
      
      {userApprovalStatus === 'denied' && (
        <div style={{
          background: 'linear-gradient(135deg, #E53935 0%, #C62828 100%)',
          color: 'white',
          padding: '1rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
        }}>
          <div style={{ fontSize: '1.5rem' }}>❌</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 'bold', marginBottom: '0.25rem' }}>
              Access Denied
            </div>
            <div style={{ fontSize: '0.85rem', opacity: 0.95 }}>
              Your request to join this room was not approved by the host.
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '2px solid #ddd' }}>
        <button
          onClick={() => setActiveTab('search')}
          style={{
            flex: 1,
            padding: '1rem',
            background: activeTab === 'search' ? '#0070f3' : 'transparent',
            color: activeTab === 'search' ? 'white' : '#333',
            fontWeight: activeTab === 'search' ? 'bold' : 'normal',
          }}
        >
          🔍 Search
        </button>
        <button
          onClick={() => setActiveTab('queue')}
          style={{
            flex: 1,
            padding: '1rem',
            background: activeTab === 'queue' ? '#0070f3' : 'transparent',
            color: activeTab === 'queue' ? 'white' : '#333',
            fontWeight: activeTab === 'queue' ? 'bold' : 'normal',
          }}
        >
          📋 Queue ({queue.filter((q) => q.status === 'pending').length})
        </button>
        <button
          onClick={() => {
            setActiveTab('history');
            fetchHistory();
          }}
          style={{
            flex: 1,
            padding: '1rem',
            background: activeTab === 'history' ? '#0070f3' : 'transparent',
            color: activeTab === 'history' ? 'white' : '#333',
            fontWeight: activeTab === 'history' ? 'bold' : 'normal',
          }}
        >
          📜 History
        </button>
        <button
          onClick={() => {
            setActiveTab('favorites');
            setFavoritesSearchQuery(''); // v4.8.1: Clear search on tab open
            fetchFavorites();
          }}
          style={{
            flex: 1,
            padding: '1rem',
            background: activeTab === 'favorites' ? '#0070f3' : 'transparent',
            color: activeTab === 'favorites' ? 'white' : '#333',
            fontWeight: activeTab === 'favorites' ? 'bold' : 'normal',
          }}
        >
          ❤️ Favorites
        </button>
        
        {/* Host-only: Approval tab (v4.0) */}
        {isHost && appConfig.features.hostApproval && room?.approval_mode === 'approval' && (
          <button
            onClick={() => setActiveTab('approval')}
            style={{
              flex: 1,
              padding: '1rem',
              background: activeTab === 'approval' ? '#0070f3' : 'transparent',
              color: activeTab === 'approval' ? 'white' : '#333',
              fontWeight: activeTab === 'approval' ? 'bold' : 'normal',
            }}
          >
            ✅ Approval
          </button>
        )}
      </div>

      {/* Search Tab */}
      {activeTab === 'search' && (
        <div style={{ padding: '1rem' }}>
          {/* v4.7.1: Block unapproved users from adding songs */}
          {!isHost && userApprovalStatus !== 'approved' && (
            <div style={{
              background: 'linear-gradient(135deg, #FFA500 0%, #FF8C00 100%)',
              color: 'white',
              padding: '1rem',
              borderRadius: '8px',
              marginBottom: '1rem',
              textAlign: 'center',
              fontWeight: 'bold',
            }}>
              ⏳ Waiting for host approval before you can add songs
            </div>
          )}
          
          {/* v4.0 YouTube Mode: Device-specific UI */}
          {appConfig.features.youtubeSearch && (isHost || userApprovalStatus === 'approved') && (
            <div>
              {/* Android: Show YouTube search box only */}
              {isAndroid() && (
                <>
                  <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', fontWeight: 'bold' }}>
                    🎤 Search for Songs on YouTube
                  </h3>
                  <SearchRedirect 
                    placeholder="Search for a karaoke song..."
                    buttonText="🔍 Search on YouTube"
                    showInstructions={true}
                  />
                </>
              )}

              {/* iOS/Desktop: Show paste link box only */}
              {(isIOS() || isDesktop()) && (
                <>
                  <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', fontWeight: 'bold' }}>
                    📋 Paste YouTube Link
                  </h3>
                  <div style={{ position: 'relative' }}>
                    {/* Smart Paste Toast - positioned near input (v4.3) */}
                    {clipboardYouTube && (
                      <div
                        style={{
                          position: 'absolute',
                          bottom: '100%',
                          left: 0,
                          right: 0,
                          marginBottom: '0.5rem',
                          zIndex: 1000,
                          background: 'linear-gradient(135deg, rgba(0, 112, 243, 0.95), rgba(0, 88, 190, 0.95))',
                          color: 'white',
                          padding: '1rem',
                          borderRadius: '12px',
                          boxShadow: '0 8px 24px rgba(0, 112, 243, 0.4)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '1rem',
                          animation: 'slideDown 0.3s ease-out',
                        }}
                      >
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '0.9rem', fontWeight: 'bold', marginBottom: '0.25rem' }}>
                            🎵 YouTube link detected!
                          </div>
                          <div style={{ fontSize: '0.85rem', opacity: 0.95 }}>
                            {clipboardYouTube.title}
                          </div>
                        </div>
                        <button
                          onClick={async () => {
                            await handleAddYouTubeUrlFromString(clipboardYouTube.url);
                            setClipboardYouTube(null);
                          }}
                          style={{
                            background: 'white',
                            color: '#0070f3',
                            border: 'none',
                            borderRadius: '8px',
                            padding: '0.5rem 1rem',
                            fontSize: '0.9rem',
                            fontWeight: 'bold',
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                            flexShrink: 0,
                          }}
                        >
                          ✅ Add
                        </button>
                        <button
                          onClick={() => setClipboardYouTube(null)}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'white',
                            fontSize: '1.5rem',
                            cursor: 'pointer',
                            padding: 0,
                            width: '32px',
                            height: '32px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            opacity: 0.8,
                            flexShrink: 0,
                          }}
                        >
                          ×
                        </button>
                      </div>
                    )}
                    
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <input
                        type="text"
                        className="input"
                        placeholder="Paste YouTube URL here..."
                        value={youtubeUrl}
                        onChange={(e) => setYoutubeUrl(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleAddYouTubeUrl()}
                        onClick={handleClipboardDetection}
                        onPaste={handlePaste}
                        disabled={addingYoutube}
                        style={{ flex: 1 }}
                      />
                      <button 
                        className="btn btn-primary" 
                        onClick={handleAddYouTubeUrl} 
                        disabled={addingYoutube || !youtubeUrl.trim()}
                        style={{ 
                          opacity: (addingYoutube || !youtubeUrl.trim()) ? 0.6 : 1,
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {addingYoutube ? 'Adding...' : '+ Add to Karaoke'}
                      </button>
                    </div>
                    
                    {/* Detailed Instructions for iOS/Computer */}
                    <div style={{
                      background: '#f8f9fa',
                      border: '1px solid #e9ecef',
                      borderRadius: '12px',
                      padding: '1.25rem',
                      marginTop: '1rem',
                      fontSize: '0.9rem',
                      color: '#555',
                    }}>
                      <div style={{ 
                        fontWeight: 'bold', 
                        fontSize: '1rem', 
                        marginBottom: '1rem',
                        color: '#333',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}>
                        <span>📱</span>
                        <span>How to Add Songs (iOS/Computer)</span>
                      </div>
                      
                      <div style={{ lineHeight: '1.8' }}>
                        <div style={{ marginBottom: '1rem' }}>
                          <strong style={{ color: '#0070f3' }}>Step 1: Open YouTube</strong>
                          <p style={{ margin: '0.25rem 0 0 0', color: '#666', fontSize: '0.9rem' }}>
                            Open the YouTube app (on iPhone/iPad) or go to <strong>youtube.com</strong> in your browser.
                          </p>
                        </div>
                        
                        <div style={{ marginBottom: '1rem' }}>
                          <strong style={{ color: '#0070f3' }}>Step 2: Search for Your Song</strong>
                          <p style={{ margin: '0.25rem 0 0 0', color: '#666', fontSize: '0.9rem' }}>
                            Search for the karaoke song you want (e.g., "Bohemian Rhapsody karaoke"). 
                            Look for videos with lyrics or karaoke versions.
                          </p>
                        </div>
                        
                        <div style={{ marginBottom: '1rem' }}>
                          <strong style={{ color: '#0070f3' }}>Step 3: Copy the Video Link</strong>
                          <p style={{ margin: '0.25rem 0 0 0', color: '#666', fontSize: '0.9rem' }}>
                            <strong>On iPhone/iPad:</strong> Tap the <strong>Share</strong> button (arrow icon) 
                            below the video, then tap <strong>"Copy Link"</strong>.
                            <br />
                            <strong>On Computer:</strong> Click the <strong>Share</strong> button below the video, 
                            then click <strong>"Copy"</strong> next to the link.
                          </p>
                        </div>
                        
                        <div style={{ marginBottom: '1rem' }}>
                          <strong style={{ color: '#0070f3' }}>Step 4: Paste in This App</strong>
                          <p style={{ margin: '0.25rem 0 0 0', color: '#666', fontSize: '0.9rem' }}>
                            Come back to this app and <strong>paste the YouTube link</strong> in the box above 
                            (tap the box and paste, or the app may auto-detect it). 
                            Then click <strong>"+ Add to Karaoke"</strong>.
                          </p>
                        </div>
                        
                        <div style={{ 
                          background: 'linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%)',
                          border: '1px solid #2196F3',
                          borderRadius: '8px',
                          padding: '0.75rem',
                          marginTop: '1rem'
                        }}>
                          <p style={{ margin: 0, fontSize: '0.85rem', color: '#1565C0', fontWeight: 600 }}>
                            💡 <strong>Quick Tip:</strong> After copying a YouTube link, tap the paste box above 
                            - the app will automatically detect it and show a preview!
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* v3.5 Database Mode: Database search */}
          {appConfig.features.databaseSearch && (isHost || userApprovalStatus === 'approved') && (
            <>
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                <input
                  type="text"
                  className="input"
                  placeholder="Search by title or artist..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                />
                <button className="btn btn-primary" onClick={handleSearch} disabled={searching} style={{ opacity: searching ? 0.6 : 1 }}>
                  {searching ? 'Searching...' : 'Search'}
                </button>
              </div>
              <div style={{ marginBottom: '1rem', fontSize: '0.85rem', color: '#666' }}>
                💡 Tip: Search by song title or artist name
              </div>

              {error && (
                <div style={{ color: '#e00', marginBottom: '1rem', fontSize: '0.9rem' }}>
                  {error}
                </div>
              )}

              {/* Database search results grid */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                  gap: '16px',
                  padding: '16px 0',
                }}
              >
                {searchResults.map((version) => (
                  <VersionCard
                    key={version.version_id}
                    version={version}
                    onAddToQueue={handleAddVersionToQueue}
                    isActive={activePreviewId === version.version_id}
                    onPreviewStart={setActivePreview}
                    onPreviewStop={() => setActivePreview(null)}
                  />
                ))}
              </div>

              {/* Empty states */}
              {searchResults.length === 0 && searchQuery && !searching && (
                <div style={{ textAlign: 'center', padding: '3rem', color: '#666' }}>
                  <p style={{ fontSize: '1.2rem', marginBottom: '0.5rem' }}>😕 No versions found</p>
                  <p style={{ fontSize: '0.9rem' }}>Try a different search term</p>
                </div>
              )}

              {searchResults.length === 0 && !searchQuery && !searching && (
                <div style={{ textAlign: 'center', padding: '3rem', color: '#666' }}>
                  <p style={{ fontSize: '1.2rem', marginBottom: '0.5rem' }}>🎤 Search for songs</p>
                  <p style={{ fontSize: '0.9rem' }}>Start typing to find karaoke tracks</p>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Queue Tab */}
      {activeTab === 'queue' && (
        <div style={{ padding: '1rem' }}>
          {/* Now Playing Section */}
          {currentSong && (
            <div style={{ marginBottom: '1.5rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 'bold', marginBottom: '0.75rem', color: '#0070f3' }}>
                ▶ Now Playing
              </h3>
              <div
                className="card"
                style={{
                  borderLeft: '4px solid #0070f3',
                  background: '#f0f8ff',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: '1rem' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 'bold', marginBottom: '0.25rem' }}>
                      {currentSong.title}
                    </div>
                    {currentSong.artist && (
                      <div style={{ fontSize: '0.9rem', color: '#666', marginBottom: '0.25rem' }}>
                        {currentSong.artist}
                      </div>
                    )}
                    <div style={{ fontSize: '0.85rem', color: '#999' }}>
                      🎤 {currentSong.user_name}
                    </div>
                  </div>
                  
                  {/* v4.6.0: Host can skip current song */}
                  {isHost && (
                    <button
                      onClick={async () => {
                        if (!room) return;
                        try {
                          await api.advancePlayback(room.id);
                          success('Skipped to next song');
                        } catch (err: any) {
                          console.error('[room] Failed to skip:', err);
                          showError('Failed to skip song');
                        }
                      }}
                      style={{
                        padding: '0.5rem 1rem',
                        background: '#dc3545',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontSize: '0.9rem',
                        fontWeight: 'bold',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        whiteSpace: 'nowrap',
                        flexShrink: 0,
                        minHeight: '44px',
                        transition: 'all 0.2s',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = '#c82333';
                        e.currentTarget.style.transform = 'scale(1.05)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = '#dc3545';
                        e.currentTarget.style.transform = 'scale(1)';
                      }}
                      title="Skip to next song"
                    >
                      <span style={{ fontSize: '1.2rem' }}>⏭️</span>
                      <span>Skip Current</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Up Next Section (Turn Order - Read-only, Informational) */}
          {upNext && (
            <div style={{ marginBottom: '1.5rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 'bold', marginBottom: '0.75rem', color: '#28a745' }}>
                Next to Play
              </h3>
              <div
                className="card"
                style={{
                  borderLeft: '4px solid #28a745',
                  background: '#f0fff4',
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.8rem', color: '#666', marginBottom: '0.25rem' }}>
                    (via round-robin)
                  </div>
                  <div style={{ fontWeight: 'bold', marginBottom: '0.25rem' }}>
                    {upNext.title}
                  </div>
                  {upNext.artist && (
                    <div style={{ fontSize: '0.9rem', color: '#666', marginBottom: '0.25rem' }}>
                      {upNext.artist}
                    </div>
                  )}
                  <div style={{ fontSize: '0.85rem', color: '#999' }}>
                    🎤 {upNext.user_name}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Queue Section - Different for Host vs Users */}
          <div style={{ width: '100%', overflow: 'visible' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 'bold', marginBottom: '0.75rem' }}>
              {isHost ? '🎵 Songs Queue (All Users)' : 'Your Queue'}
            </h3>
            {isHost && (
              <div style={{ 
                marginBottom: '0.75rem', 
                padding: '0.75rem', 
                background: '#fff3cd', 
                borderRadius: '8px', 
                fontSize: '0.85rem', 
                color: '#856404' 
              }}>
                💡 <strong>Host Controls:</strong> You can reorder or remove any song from any user
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', width: '100%' }}>
              {(isHost ? queue.filter(q => q.status === 'pending') : userQueue).length > 0 ? (
                (isHost ? queue.filter(q => q.status === 'pending') : userQueue).map((item, index) => (
                  <div
                    key={item.id}
                    style={{
                      width: '100%',
                      background: 'white',
                      borderRadius: '12px',
                      padding: '1rem',
                      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'start',
                      gap: '1rem',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.8rem', color: '#666', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span>#{index + 1}</span>
                        {/* v4.7.4: Show round number for round-robin */}
                        {room?.queue_mode === 'round_robin' && item.round_number && (
                          <span style={{ 
                            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                            color: 'white',
                            padding: '0.15rem 0.5rem',
                            borderRadius: '12px',
                            fontSize: '0.75rem',
                            fontWeight: 'bold'
                          }}>
                            Round {item.round_number}
                          </span>
                        )}
                      </div>
                      <div style={{ fontWeight: 'bold', marginBottom: '0.25rem', wordBreak: 'break-word' }}>
                        {item.title}
                      </div>
                      {item.artist && (
                        <div style={{ fontSize: '0.9rem', color: '#666', marginBottom: '0.25rem', wordBreak: 'break-word' }}>
                          {item.artist}
                        </div>
                      )}
                      {/* Show user name for host view */}
                      {isHost && (
                        <div style={{ fontSize: '0.85rem', color: '#0070f3', marginTop: '0.25rem' }}>
                          🎤 {item.user_name || 'Unknown'}
                        </div>
                      )}
                    </div>
                    
                    {/* Controls: Up/Down Arrows + Remove Button */}
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexShrink: 0 }}>
                      {/* Up Arrow */}
                      <button
                        onClick={() => handleReorder(item.id, 'up')}
                        disabled={reorderingId === item.id || index === 0}
                        style={{
                          padding: '0.5rem',
                          background: index === 0 ? '#f5f5f5' : '#0070f3',
                          border: 'none',
                          borderRadius: '8px',
                          cursor: (reorderingId === item.id || index === 0) ? 'not-allowed' : 'pointer',
                          fontSize: '1.2rem',
                          lineHeight: 1,
                          minWidth: '44px',
                          minHeight: '44px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'all 0.2s',
                          opacity: (reorderingId === item.id || index === 0) ? 0.5 : 1,
                          color: 'white',
                        }}
                        title="Move up"
                      >
                        ⬆️
                      </button>
                      
                      {/* Down Arrow */}
                      <button
                        onClick={() => handleReorder(item.id, 'down')}
                        disabled={reorderingId === item.id || index === (isHost ? queue.filter(q => q.status === 'pending') : userQueue).length - 1}
                        style={{
                          padding: '0.5rem',
                          background: index === (isHost ? queue.filter(q => q.status === 'pending') : userQueue).length - 1 ? '#f5f5f5' : '#0070f3',
                          border: 'none',
                          borderRadius: '8px',
                          cursor: (reorderingId === item.id || index === (isHost ? queue.filter(q => q.status === 'pending') : userQueue).length - 1) ? 'not-allowed' : 'pointer',
                          fontSize: '1.2rem',
                          lineHeight: 1,
                          minWidth: '44px',
                          minHeight: '44px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'all 0.2s',
                          opacity: (reorderingId === item.id || index === (isHost ? queue.filter(q => q.status === 'pending') : userQueue).length - 1) ? 0.5 : 1,
                          color: 'white',
                        }}
                        title="Move down"
                      >
                        ⬇️
                      </button>
                      
                      {/* Remove Button */}
                      <button
                        onClick={() => handleRemoveFromQueue(item.id, item.title || item.song?.title || 'Song')}
                        disabled={removingFromQueue}
                        style={{
                          padding: '0.5rem',
                          background: '#dc3545',
                          border: 'none',
                          borderRadius: '8px',
                          cursor: removingFromQueue ? 'not-allowed' : 'pointer',
                          fontSize: '1.5rem',
                          lineHeight: 1,
                          minWidth: '48px',
                          minHeight: '48px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'all 0.2s',
                          opacity: removingFromQueue ? 0.6 : 1,
                          boxShadow: '0 2px 4px rgba(220, 53, 69, 0.3)',
                        }}
                        onMouseEnter={(e) => {
                          if (!removingFromQueue) {
                            e.currentTarget.style.background = '#c82333';
                            e.currentTarget.style.transform = 'scale(1.1)';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!removingFromQueue) {
                            e.currentTarget.style.background = '#dc3545';
                            e.currentTarget.style.transform = 'scale(1)';
                          }
                        }}
                        title="Remove song from queue"
                      >
                        {removingFromQueue ? '⏳' : '🗑️'}
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#666' }}>
                  You haven't added any songs yet. Go to Search to add some!
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* History Tab */}
      {activeTab === 'history' && (
        <div style={{ padding: '1rem' }}>
          <h3 style={{ fontSize: '1.2rem', marginBottom: '1rem', fontWeight: 'bold', color: '#333' }}>
            📜 Your Song History (Last 12 Months)
          </h3>
          
          {historyLoading ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#666' }}>
              Loading history...
            </div>
          ) : history.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#666' }}>
              No history found. Start singing to build your history!
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {history.map((item) => {
                const isYouTube = item.source_type === 'youtube' || item.youtube_url;
                const favoriteId = isYouTube ? item.id : item.version_id; // Use queue_item_id for YouTube, version_id for database
                
                return (
                  <div 
                    key={item.id} 
                    className="card" 
                    style={{ 
                      padding: '0.75rem',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>
                        {item.song?.title || 'Unknown'}
                      </div>
                      <div style={{ fontSize: '0.85rem', color: '#666' }}>
                        {item.song?.artist || 'Unknown'}
                        {!isYouTube && item.song?.tone && ` • ${item.song.tone}`}
                        {!isYouTube && item.song?.mixer && ` • ${item.song.mixer}`}
                        {!isYouTube && item.song?.style && ` • ${item.song.style}`}
                        {isYouTube && item.youtube_url && (
                          <span style={{ color: '#0070f3', wordBreak: 'break-all' }}>
                            {' • '}
                            <a 
                              href={item.youtube_url} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              style={{ color: '#0070f3', textDecoration: 'underline' }}
                            >
                              {item.youtube_url}
                            </a>
                          </span>
                        )}
                        {' • '}{new Date(item.sung_at).toLocaleDateString()}
                        {item.times_sung > 1 && ` • ${item.times_sung} times`}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <button
                        onClick={() => favoriteId && toggleFavorite(favoriteId)}
                        style={{
                          background: 'none',
                          border: 'none',
                          fontSize: '1.5rem',
                          cursor: 'pointer',
                          padding: '0.25rem',
                          transition: 'transform 0.2s',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.transform = 'scale(1.2)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.transform = 'scale(1)';
                        }}
                        title={favoriteSongIds.has(favoriteId) ? 'Remove from favorites' : 'Add to favorites'}
                      >
                        {favoriteSongIds.has(favoriteId) ? '❤️' : '🤍'}
                      </button>
                      <button
                        onClick={async () => {
                          if (!room || !user || !confirm(`Remove "${item.song?.title || 'this song'}" from your history?`)) return;
                          
                          setHistoryLoading(true);
                          try {
                            const sourceType = isYouTube ? 'youtube' : 'database';
                            const response = await fetch(`/api/users/${user.id}/history/${item.id}?source_type=${sourceType}`, {
                              method: 'DELETE',
                            });
                            
                            if (!response.ok) {
                              throw new Error('Failed to delete history entry');
                            }
                            
                            console.log('[History] Deleted history entry:', item.id);
                            // Refresh history list
                            await fetchHistory();
                            success('Song removed from history');
                          } catch (error) {
                            console.error('[History] Delete error:', error);
                            showError('Failed to remove song from history');
                          } finally {
                            setHistoryLoading(false);
                          }
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          fontSize: '1.3rem',
                          cursor: 'pointer',
                          padding: '0.25rem',
                          transition: 'transform 0.2s',
                          color: '#dc3545',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.transform = 'scale(1.2)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.transform = 'scale(1)';
                        }}
                        title="Remove from history"
                      >
                        🗑️
                      </button>
                      <button
                        className="btn btn-sm"
                        onClick={async () => {
                          if (!room || !user) return;
                          
                          if (isYouTube && item.youtube_url) {
                            // Add YouTube song to karaoke queue
                            console.log('[History] Add to Karaoke clicked for YouTube URL:', item.youtube_url);
                            await handleAddYouTubeUrlFromString(item.youtube_url);
                          } else if (item.version_id) {
                            // Add database song to karaoke queue
                            console.log('[History] Add to Karaoke clicked for version_id:', item.version_id);
                            await handleAddVersionToQueue(item.version_id);
                          }
                        }}
                        style={{ 
                          padding: '0.5rem 1rem',
                          fontSize: '0.9rem',
                        }}
                      >
                        Add to Karaoke
                      </button>
                      {isYouTube && item.youtube_url && (
                        <button
                          className="btn btn-sm"
                          onClick={() => {
                            // Add to music queue (foreground playback)
                            const song: MusicQueueItem = {
                              id: item.id,
                              title: item.song?.title || 'Unknown',
                              title_display: item.song?.title || 'Unknown',
                              artist: item.song?.artist || 'Unknown Artist',
                              artist_name: item.song?.artist || 'Unknown Artist',
                              youtube_url: item.youtube_url,
                              source_type: 'youtube',
                            };
                            addToMusicQueue(song);
                          }}
                          style={{ 
                            padding: '0.5rem 1rem',
                            fontSize: '0.9rem',
                            background: '#28a745',
                            color: '#fff',
                          }}
                        >
                          Add to Music
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Favorites Tab */}
      {activeTab === 'favorites' && (
        <div style={{ padding: '1rem' }}>
          {/* v4.8.1: Search box for favorites */}
          <input
            type="text"
            placeholder="🔍 Search your favorites..."
            value={favoritesSearchQuery}
            onChange={(e) => setFavoritesSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '0.75rem',
              fontSize: '1rem',
              border: '2px solid #e0e0e0',
              borderRadius: '8px',
              marginBottom: '1rem',
              outline: 'none',
              transition: 'border-color 0.2s',
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = '#0070f3';
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = '#e0e0e0';
            }}
          />

          {/* Music Queue Section */}
          {musicQueue.length > 0 && (
            <div style={{
              marginBottom: '1.5rem',
              padding: '1rem',
              background: '#f5f5f5',
              borderRadius: '8px',
              border: '1px solid #e0e0e0',
            }}>
              <h4 style={{ fontSize: '1.1rem', marginBottom: '0.75rem', fontWeight: 'bold', color: '#333' }}>
                🎵 Music Queue ({musicQueue.length} {musicQueue.length === 1 ? 'song' : 'songs'})
              </h4>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
                {musicQueue.map((fav, index) => {
                  const isCurrentlyPlaying = currentPlayingIndex === index && isPlayingMusic;
                  const isNext = currentPlayingIndex !== null && index === currentPlayingIndex + 1;
                  
                  return (
                    <div
                      key={`${fav.id}-${index}`}
                      style={{
                        padding: '0.75rem',
                        background: isCurrentlyPlaying ? '#e3f2fd' : '#fff',
                        borderRadius: '6px',
                        border: isCurrentlyPlaying ? '2px solid #0070f3' : '1px solid #e0e0e0',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: isCurrentlyPlaying ? 'bold' : 'normal', marginBottom: '0.25rem' }}>
                          {isCurrentlyPlaying && '▶ '}
                          {isNext && '⏭ '}
                          {index + 1}. {fav.title_display || fav.title || 'Unknown'}
                        </div>
                        <div style={{ fontSize: '0.85rem', color: '#666' }}>
                          {fav.artist_name || fav.artist || 'Unknown Artist'}
                          {isCurrentlyPlaying && <span style={{ color: '#0070f3', marginLeft: '0.5rem' }}>(Playing)</span>}
                          {isNext && <span style={{ color: '#666', marginLeft: '0.5rem' }}>(Next)</span>}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                        <button
                          onClick={() => reorderMusicQueue(index, Math.max(0, index - 1))}
                          disabled={index === 0}
                          style={{
                            padding: '0.25rem 0.5rem',
                            fontSize: '0.85rem',
                            background: index === 0 ? '#f0f0f0' : '#fff',
                            border: '1px solid #e0e0e0',
                            borderRadius: '4px',
                            cursor: index === 0 ? 'not-allowed' : 'pointer',
                            opacity: index === 0 ? 0.5 : 1,
                          }}
                          title="Move up"
                        >
                          ↑
                        </button>
                        <button
                          onClick={() => reorderMusicQueue(index, Math.min(musicQueue.length - 1, index + 1))}
                          disabled={index === musicQueue.length - 1}
                          style={{
                            padding: '0.25rem 0.5rem',
                            fontSize: '0.85rem',
                            background: index === musicQueue.length - 1 ? '#f0f0f0' : '#fff',
                            border: '1px solid #e0e0e0',
                            borderRadius: '4px',
                            cursor: index === musicQueue.length - 1 ? 'not-allowed' : 'pointer',
                            opacity: index === musicQueue.length - 1 ? 0.5 : 1,
                          }}
                          title="Move down"
                        >
                          ↓
                        </button>
                        <button
                          onClick={() => removeFromMusicQueue(index)}
                          style={{
                            padding: '0.25rem 0.5rem',
                            fontSize: '0.85rem',
                            background: '#dc3545',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                          }}
                          title="Remove"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
              
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button
                  onClick={playMusicQueue}
                  disabled={musicQueue.length === 0 || (isPlayingMusic && currentPlayingIndex !== null)}
                  style={{
                    padding: '0.75rem 1.5rem',
                    fontSize: '1rem',
                    background: isPlayingMusic && currentPlayingIndex !== null ? '#28a745' : '#0070f3',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: musicQueue.length === 0 ? 'not-allowed' : 'pointer',
                    opacity: musicQueue.length === 0 ? 0.5 : 1,
                    fontWeight: 'bold',
                  }}
                >
                  ▶ Play Music
                </button>
                {isPlayingMusic && currentPlayingIndex !== null && (
                  <button
                    onClick={pauseMusicPlayback}
                    style={{
                      padding: '0.75rem 1.5rem',
                      fontSize: '1rem',
                      background: '#ffc107',
                      color: '#000',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontWeight: 'bold',
                    }}
                  >
                    ⏸ Pause
                  </button>
                )}
                {isPlayingMusic && currentPlayingIndex !== null && (
                  <button
                    onClick={playNextInMusicQueue}
                    style={{
                      padding: '0.75rem 1.5rem',
                      fontSize: '1rem',
                      background: '#17a2b8',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontWeight: 'bold',
                    }}
                  >
                    ⏭ Next
                  </button>
                )}
                <button
                  onClick={clearMusicQueue}
                  style={{
                    padding: '0.75rem 1.5rem',
                    fontSize: '1rem',
                    background: '#6c757d',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontWeight: 'bold',
                  }}
                >
                  Clear Queue
                </button>
              </div>
            </div>
          )}
          
          <h3 style={{ fontSize: '1.2rem', marginBottom: '1rem', fontWeight: 'bold', color: '#333' }}>
            ❤️ Your Favorite Songs
          </h3>
          
          {favoritesLoading ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#666' }}>
              Loading favorites...
            </div>
          ) : favorites.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#666' }}>
              No favorites yet. Add songs from your History tab!
            </div>
          ) : (
            (() => {
              // v4.8.2: Normalize text - remove accents for accent-insensitive search
              const normalizeText = (text: string): string => {
                return text
                  .toLowerCase()
                  .normalize('NFD') // Decompose accented characters
                  .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
                  .replace(/đ/g, 'd') // Vietnamese đ → d
                  .replace(/Đ/g, 'd');
              };

              // v4.8.2: Filter favorites with accent-insensitive search
              const filteredFavorites = favoritesSearchQuery.trim() === '' 
                ? favorites 
                : favorites.filter((version: any) => {
                    const query = normalizeText(favoritesSearchQuery);
                    const title = normalizeText(version.title_display || version.title || '');
                    const artist = normalizeText(version.artist_name || version.artist || '');
                    const tone = normalizeText(version.tone || '');
                    const mixer = normalizeText(version.mixer || '');
                    const style = normalizeText(version.style || '');
                    
                    return title.includes(query) || 
                           artist.includes(query) || 
                           tone.includes(query) || 
                           mixer.includes(query) || 
                           style.includes(query);
                  });

              return filteredFavorites.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#666' }}>
                  No favorites match "{favoritesSearchQuery}"
                </div>
              ) : (
                <>
                  <div style={{ fontSize: '0.9rem', color: '#666', marginBottom: '0.5rem' }}>
                    Showing {filteredFavorites.length} of {favorites.length} favorites
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {filteredFavorites.map((version: any) => {
                const isYouTube = version.source_type === 'youtube' || version.youtube_url;
                
                return (
                  <div 
                    key={version.id} 
                    className="card" 
                    style={{ 
                      padding: '0.75rem',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>
                        {version.title_display || version.title || 'Unknown'}
                      </div>
                      <div style={{ fontSize: '0.85rem', color: '#666' }}>
                        {version.artist_name || version.artist || 'Unknown Artist'} 
                        {!isYouTube && version.tone && ` • ${version.tone}`}
                        {!isYouTube && version.mixer && ` • ${version.mixer}`}
                        {!isYouTube && version.style && ` • ${version.style}`}
                        {isYouTube && version.youtube_url && (
                          <span style={{ color: '#0070f3', wordBreak: 'break-all' }}>
                            {' • '}
                            <a 
                              href={version.youtube_url} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              style={{ color: '#0070f3', textDecoration: 'underline' }}
                            >
                              {version.youtube_url}
                            </a>
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <button
                        onClick={() => toggleFavorite(version.id)}
                        style={{
                          background: 'none',
                          border: 'none',
                          fontSize: '1.5rem',
                          cursor: 'pointer',
                          padding: '0.25rem',
                          transition: 'transform 0.2s',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.transform = 'scale(1.2)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.transform = 'scale(1)';
                        }}
                        title="Remove from favorites"
                      >
                        ❤️
                      </button>
                      <button
                        className="btn btn-sm"
                        onClick={async () => {
                          if (!room || !user) return;
                          
                          if (isYouTube && version.youtube_url) {
                            // Add YouTube song to karaoke queue
                            console.log('[Favorites] Add to Karaoke clicked for YouTube URL:', version.youtube_url);
                            await handleAddYouTubeUrlFromString(version.youtube_url);
                          } else {
                            // Add database song to karaoke queue
                            console.log('[Favorites] Add to Karaoke clicked for version_id:', version.id);
                            await handleAddVersionToQueue(version.id);
                          }
                        }}
                        style={{ 
                          padding: '0.5rem 1rem',
                          fontSize: '0.9rem',
                        }}
                      >
                        Add to Karaoke
                      </button>
                      {isYouTube && version.youtube_url && (
                        <button
                          className="btn btn-sm"
                          onClick={() => {
                            // Add to music queue (foreground playback)
                            const song: MusicQueueItem = {
                              id: version.id,
                              title: version.title_display || version.title || 'Unknown',
                              title_display: version.title_display || version.title || 'Unknown',
                              artist: version.artist_name || version.artist || 'Unknown Artist',
                              artist_name: version.artist_name || version.artist || 'Unknown Artist',
                              youtube_url: version.youtube_url,
                              source_type: 'youtube',
                            };
                            addToMusicQueue(song);
                          }}
                          style={{ 
                            padding: '0.5rem 1rem',
                            fontSize: '0.9rem',
                            background: '#28a745',
                            color: '#fff',
                          }}
                        >
                          Add to Music
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
                  </div>
                </>
              );
            })()
          )}
        </div>
      )}

      {/* Approval Tab (Host-only, v4.0) */}
      {activeTab === 'approval' && isHost && room && (
        <div style={{ padding: '1rem' }}>
          <h3 style={{ fontSize: '1.2rem', marginBottom: '1rem', fontWeight: 'bold', color: '#333' }}>
            ✅ User Approval Queue
          </h3>
          
          <div style={{ marginBottom: '1rem', padding: '0.75rem', background: '#f0f8ff', borderRadius: '4px', fontSize: '0.9rem', color: '#666' }}>
            💡 <strong>Tip:</strong> Users waiting for approval have 15 minutes before their request expires. 
            Once approved, they can add songs to the queue.
          </div>
          
          <ApprovalQueue 
            roomId={room.id} 
            hostId={room.host_id || user?.id || ''} 
            onNewUser={(userName) => success(`🎤 ${userName} wants to join the party!`)}
          />
        </div>
      )}

      {/* Music Player - Visible at bottom when playing */}
      {musicQueue.length > 0 && currentPlayingIndex !== null && musicQueue[currentPlayingIndex]?.youtube_url && (
        <div
          style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            background: '#000',
            zIndex: 1000,
            borderTop: '2px solid #0070f3',
            padding: '1rem',
          }}
        >
          <div style={{ maxWidth: '800px', margin: '0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <div style={{ color: '#fff', fontWeight: 'bold' }}>
                🎵 Now Playing: {musicQueue[currentPlayingIndex]?.title_display || musicQueue[currentPlayingIndex]?.title || 'Unknown'}
              </div>
              <button
                onClick={() => {
                  setCurrentPlayingIndex(null);
                  setIsPlayingMusic(false);
                  isPlayingMusicRef.current = false;
                  if (favoritePlayerRef.current) {
                    favoritePlayerRef.current.stopVideo();
                  }
                }}
                style={{
                  background: 'rgba(255,255,255,0.2)',
                  border: 'none',
                  color: '#fff',
                  padding: '0.5rem 1rem',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                ✕ Close
              </button>
            </div>
            <div
              ref={favoritePlayerContainerRef}
              style={{
                width: '100%',
                aspectRatio: '16/9',
                maxHeight: '400px',
                background: '#000',
                // Android: Always render container (don't use display:none) to avoid embedding issues
                display: currentPlayingIndex !== null ? 'block' : (isAndroid() ? 'block' : 'none'),
                visibility: currentPlayingIndex !== null ? 'visible' : (isAndroid() ? 'hidden' : 'hidden'),
                // Android: Ensure container has dimensions even when hidden
                minHeight: isAndroid() ? '180px' : 'auto',
                minWidth: isAndroid() ? '320px' : 'auto',
              }}
            >
              <YouTubePlayer
                key={`music-player-${currentPlayingIndex}-${musicQueue[currentPlayingIndex].id}`}
                videoUrl={musicQueue[currentPlayingIndex].youtube_url}
                autoPlay={false}
                controls={true}
                onReady={handleMusicPlayerReady}
                onEnded={handleMusicPlayerEnded}
                onStateChange={handleMusicPlayerStateChange}
                onError={handleMusicPlayerError}
                width="100%"
                height="100%"
              />
            </div>
          </div>
        </div>
      )}

      {/* Toast Notifications */}
      <ToastContainer />
      
      {/* Android Debug Panel */}
      {isAndroid() && (
        <>
          <button
            onClick={() => setShowDebugPanel(!showDebugPanel)}
            style={{
              position: 'fixed',
              top: '10px',
              right: '10px',
              zIndex: 10000,
              background: showDebugPanel ? '#ff4444' : '#0070f3',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              padding: '8px 12px',
              fontSize: '12px',
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
            }}
          >
            {showDebugPanel ? 'Hide Debug' : 'Show Debug'}
          </button>
          
          {showDebugPanel && (
            <div
              style={{
                position: 'fixed',
                top: '50px',
                right: '10px',
                width: '90%',
                maxWidth: '400px',
                maxHeight: '60vh',
                background: '#1a1a1a',
                color: '#0f0',
                border: '2px solid #0070f3',
                borderRadius: '8px',
                padding: '12px',
                zIndex: 10000,
                overflow: 'auto',
                fontFamily: 'monospace',
                fontSize: '10px',
                lineHeight: '1.4',
                boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', alignItems: 'center' }}>
                <div style={{ color: '#fff', fontWeight: 'bold', fontSize: '12px' }}>
                  🐛 Android Debug Logs
                </div>
                <button
                  onClick={() => {
                    debugLogsRef.current = [];
                    setDebugLogs([]);
                  }}
                  style={{
                    background: '#ff4444',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '4px 8px',
                    fontSize: '10px',
                    cursor: 'pointer',
                  }}
                >
                  Clear
                </button>
              </div>
              <div style={{ color: '#888', fontSize: '9px', marginBottom: '8px' }}>
                Origin: {typeof window !== 'undefined' ? window.location.origin : 'N/A'}
              </div>
              <div style={{ color: '#888', fontSize: '9px', marginBottom: '8px' }}>
                URL: {typeof window !== 'undefined' ? window.location.href : 'N/A'}
              </div>
              <div style={{ borderTop: '1px solid #333', paddingTop: '8px', maxHeight: '50vh', overflow: 'auto' }}>
                {debugLogs.length === 0 ? (
                  <div style={{ color: '#666', fontStyle: 'italic' }}>No logs yet...</div>
                ) : (
                  debugLogs.map((log, idx) => {
                    const isError = log.includes('[ERROR]');
                    const isWarn = log.includes('[WARN]');
                    return (
                      <div
                        key={idx}
                        style={{
                          color: isError ? '#ff6b6b' : isWarn ? '#ffd93d' : '#0f0',
                          marginBottom: '4px',
                          wordBreak: 'break-word',
                        }}
                      >
                        {log}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* Confirmation Modal for Remove */}
      {showConfirmRemove && pendingRemove && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000,
            padding: '1rem',
          }}
          onClick={() => {
            setShowConfirmRemove(false);
            setPendingRemove(null);
          }}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: '12px',
              padding: '1.5rem',
              maxWidth: '400px',
              width: '100%',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ margin: 0, marginBottom: '1rem', fontSize: '1.5rem' }}>
              Remove Song?
            </h2>
            <p style={{ margin: 0, marginBottom: '1.5rem', color: '#666', fontSize: '1rem' }}>
              Remove "{pendingRemove.title}" from your queue?
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setShowConfirmRemove(false);
                  setPendingRemove(null);
                }}
                style={{
                  padding: '0.75rem 1.5rem',
                  fontSize: '1rem',
                  background: '#f5f5f5',
                  color: '#333',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: '500',
                }}
              >
                Cancel
              </button>
              <button
                onClick={confirmRemove}
                disabled={removingFromQueue}
                style={{
                  padding: '0.75rem 1.5rem',
                  fontSize: '1rem',
                  background: removingFromQueue ? '#999' : '#dc3545',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: removingFromQueue ? 'not-allowed' : 'pointer',
                  fontWeight: '500',
                  opacity: removingFromQueue ? 0.6 : 1,
                }}
              >
                {removingFromQueue ? 'Removing...' : 'Remove'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

