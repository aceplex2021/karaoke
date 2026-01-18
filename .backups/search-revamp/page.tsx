'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { getOrCreateFingerprint } from '@/lib/utils';
import type { Room, User, Song, QueueItem, SongGroupResult, GroupVersion, RoomState } from '@/shared/types';
import { useToast } from '@/components/Toast';

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
  const [searchResults, setSearchResults] = useState<SongGroupResult[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [showVersionSelector, setShowVersionSelector] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [addingToQueue, setAddingToQueue] = useState(false);
  const [removingFromQueue, setRemovingFromQueue] = useState(false);
  const [reorderingId, setReorderingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'search' | 'queue' | 'history' | 'favorites'>('search');
  const [showNameInput, setShowNameInput] = useState(false);
  const [showConfirmRemove, setShowConfirmRemove] = useState(false);
  const [pendingRemove, setPendingRemove] = useState<{ id: string; title: string } | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [favorites, setFavorites] = useState<Song[]>([]);
  const [favoritesLoading, setFavoritesLoading] = useState(false);
  const [favoriteSongIds, setFavoriteSongIds] = useState<Set<string>>(new Set());
  
  const roomIdRef = useRef<string | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // Toast notifications
  const { success, error: showError, ToastContainer } = useToast();

  /**
   * Refresh room state from backend (canonical source of truth)
   * Gets queue (ledger order) + upNext (turn order) + currentSong from backend
   * No local queue math - backend is single source of truth
   */
  const refreshRoomState = useCallback(async (roomId: string) => {
    try {
      const state = await api.getRoomState(roomId);
      setRoom(state.room);
      setQueue(state.queue); // Ledger order (all pending items, by position)
      setUpNext(state.upNext); // Turn order (next to play via round-robin, read-only, informational)
      setCurrentSong(state.currentSong); // Currently playing (if any)
      console.log('[room] refreshRoomState done - queue:', state.queue.length, 'upNext:', state.upNext?.song?.title || 'none', 'current:', state.currentSong?.song?.title || 'none');
    } catch (err: any) {
      console.error('[room] Failed to refresh room state:', err);
      setError(err.message || 'Failed to refresh room state');
    }
  }, []);

  /**
   * Start polling room state
   * Polls refreshRoomState every 2.5 seconds
   */
  const startPolling = useCallback((roomId: string) => {
    // Don't start if already polling
    if (pollingIntervalRef.current) {
      return;
    }
    
    console.log('[room] Starting polling (2.5s interval)');
    pollingIntervalRef.current = setInterval(() => {
      const currentRoomId = roomIdRef.current;
      if (currentRoomId) {
        console.log('[room] Polling refreshRoomState');
        refreshRoomState(currentRoomId);
      }
    }, 2500); // 2.5 seconds
  }, [refreshRoomState]);

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
      
      // Ensure display name is stored (backend might have updated it)
      if (userData.display_name) {
        localStorage.setItem('user_display_name', userData.display_name);
      }

      roomIdRef.current = roomData.id;
      
      // Initial load of room state
      await refreshRoomState(roomData.id);

      // Start polling
      startPolling(roomData.id);
    } catch (err: any) {
      setError(err.message || 'Failed to join room');
    } finally {
      setLoading(false);
    }
  }, [code, refreshRoomState, startPolling]);

  const handleNameConfirm = useCallback((name: string) => {
    // Store name in localStorage
    localStorage.setItem('user_display_name', name);
    setShowNameInput(false);
    setLoading(true);
    // Join room with the entered name
    joinRoom(name);
  }, [joinRoom]);

  // Always require name input when joining room
  useEffect(() => {
    if (code) {
      // Always show name input modal - name is required to join
      setShowNameInput(true);
      setLoading(false); // Don't show loading spinner while waiting for name
    }
    
    // Cleanup on unmount
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [code]);

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

  // Fetch history when history tab is activated
  const fetchHistory = useCallback(async () => {
    if (!user || !room) return;
    
    setHistoryLoading(true);
    try {
      // Fetch both history and favorites
      const [{ history: historyData }, { favorites: favoritesData }] = await Promise.all([
        api.getUserHistory(user.id, room.id),
        api.getUserFavorites(user.id),
      ]);
      setHistory(historyData || []);
      // Update favoriteSongIds for heart icon display
      const favoriteIds = new Set(favoritesData.map((song: Song) => song.id));
      setFavoriteSongIds(favoriteIds);
    } catch (error) {
      console.error('Failed to fetch history:', error);
      showError('Failed to load history');
    } finally {
      setHistoryLoading(false);
    }
  }, [user, room, showError]);

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
      console.log('Searching with query:', trimmedQuery);
      const { results } = await api.searchSongs({
        q: trimmedQuery,
        limit: 50,
      });
      console.log('Search results:', results.length);
      setSearchResults(results);
      if (results.length === 0) {
        setError('No songs found. Try a different search term.');
      }
    } catch (err: any) {
      console.error('Search error:', err);
      setError(err.message || 'Failed to search songs');
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

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
        // If multiple versions available, open selector; otherwise show error
        if (group.available.version_count > 1) {
          setSelectedGroupId(group.group_id);
          setShowVersionSelector(true);
          return;
        }
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
      setShowVersionSelector(false);
      setSelectedGroupId(null);
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
    if (!user) return;
    
    setReorderingId(queueItemId);
    
    try {
      await api.reorderQueueItem(queueItemId, direction, user.id);
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
      <div className="phone-mode" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', flexDirection: 'column', gap: '1rem', padding: '2rem' }}>
        <div style={{ fontSize: '1.5rem', color: '#e00' }}>{error}</div>
        <a href="/" className="btn btn-primary">Go Home</a>
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
      </div>

      {/* Search Tab */}
      {activeTab === 'search' && (
        <div style={{ padding: '1rem' }}>
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

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {searchResults.map((group) => (
              <div
                key={group.group_id}
                className="card"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.5rem',
                  padding: '1rem',
                  borderRadius: '8px',
                  border: '1px solid #e0e0e0',
                  background: '#fff',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 'bold', fontSize: '1.1rem', marginBottom: '0.25rem' }}>
                      {group.display_title}
                    </div>
                    {group.artists.length > 0 && (
                      <div style={{ fontSize: '0.9rem', color: '#666', marginBottom: '0.5rem' }}>
                        {group.artists.join(', ')}
                      </div>
                    )}
                    {/* Enhanced Version Info Display */}
                    {group.best_version && (
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '0.75rem', 
                        marginTop: '0.75rem',
                        padding: '0.5rem',
                        background: 'rgba(33, 150, 243, 0.1)',
                        borderRadius: '6px',
                      }}>
                        <span style={{ fontSize: '1.5rem', flexShrink: 0 }}>
                          {getVersionIcon(group.best_version.label)}
                        </span>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', flex: 1 }}>
                          <span style={{
                            fontSize: '0.85rem',
                            padding: '0.25rem 0.5rem',
                            background: 'white',
                            borderRadius: '4px',
                            fontWeight: '600',
                            color: '#333',
                          }}>
                            {formatMixerLabel(group.best_version.label)}
                          </span>
                          {group.best_version.pitch && (
                            <span style={{
                              fontSize: '0.75rem',
                              padding: '0.25rem 0.5rem',
                              background: 'linear-gradient(135deg, #E3F2FD 0%, #BBDEFB 100%)',
                              color: '#1976D2',
                              borderRadius: '4px',
                              fontWeight: '600',
                            }}>
                              🎹 {group.best_version.pitch}
                            </span>
                          )}
                          {group.best_version.tempo && (
                            <span style={{
                              fontSize: '0.75rem',
                              padding: '0.25rem 0.5rem',
                              background: 'linear-gradient(135deg, #FFF3E0 0%, #FFE0B2 100%)',
                              color: '#F57C00',
                              borderRadius: '4px',
                              fontWeight: '600',
                            }}>
                              ⚡ {group.best_version.tempo} BPM
                            </span>
                          )}
                          {group.best_version.is_default && (
                            <span style={{
                              fontSize: '0.75rem',
                              padding: '0.25rem 0.5rem',
                              background: 'linear-gradient(135deg, #4CAF50 0%, #45a049 100%)',
                              color: 'white',
                              borderRadius: '4px',
                              fontWeight: '600',
                            }}>
                              ⭐ Recommended
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                    {group.available.version_count > 1 && (
                      <div style={{ marginTop: '0.5rem' }}>
                        <span
                          onClick={() => {
                            setSelectedGroupId(group.group_id);
                            setShowVersionSelector(true);
                          }}
                          style={{
                            fontSize: '0.85rem',
                            padding: '0.5rem 0.75rem',
                            background: '#fff3cd',
                            color: '#856404',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            border: '1px solid #ffc107',
                            display: 'inline-block',
                            fontWeight: '500',
                          }}
                        >
                          See {group.available.version_count} versions
                        </span>
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', marginLeft: '1rem' }}>
                    {group.available.version_count > 1 && (
                      <button
                        className="btn"
                        onClick={() => {
                          setSelectedGroupId(group.group_id);
                          setShowVersionSelector(true);
                        }}
                        style={{
                          padding: '0.5rem 1rem',
                          background: '#f8f9fa',
                          border: '1px solid #dee2e6',
                          borderRadius: '4px',
                          fontSize: '0.9rem',
                        }}
                      >
                        Versions
                      </button>
                    )}
                    <button
                      className="btn btn-primary"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        console.log('[button] Add clicked for group:', {
                          group_id: group.group_id,
                          display_title: group.display_title,
                          best_version: group.best_version,
                          has_best_version: !!group.best_version,
                          version_id: group.best_version?.version_id
                        });
                        try {
                          if (!group.best_version || !group.best_version.version_id) {
                            console.warn('[button] No best_version available, opening version selector');
                            if (group.available.version_count > 1) {
                              setSelectedGroupId(group.group_id);
                              setShowVersionSelector(true);
                            } else {
                              setError('No version available for this song');
                            }
                            return;
                          }
                          handleAddToQueue(group);
                        } catch (err) {
                          console.error('[button] Error in onClick handler:', err);
                          setError(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
                        }
                      }}
                      disabled={addingToQueue}
                      style={{ 
                        padding: '0.5rem 1.5rem',
                        opacity: addingToQueue ? 0.6 : 1,
                        cursor: addingToQueue ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {addingToQueue ? 'Adding...' : 'Add'}
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {searchResults.length === 0 && searchQuery && !searching && (
              <div style={{ textAlign: 'center', padding: '2rem', color: '#666' }}>
                No songs found. Try a different search term.
              </div>
            )}

            {searchResults.length === 0 && !searchQuery && !searching && (
              <div style={{ textAlign: 'center', padding: '2rem', color: '#666' }}>
                Enter a search term to find songs (required)
              </div>
            )}
          </div>

          {/* Version Selector Modal */}
          {showVersionSelector && selectedGroupId && (
            <VersionSelectorModal
              groupId={selectedGroupId}
              group={searchResults.find(g => g.group_id === selectedGroupId)!}
              onSelect={(versionId) => {
                const group = searchResults.find(g => g.group_id === selectedGroupId);
                if (group) {
                  handleAddToQueue(group, versionId);
                }
              }}
              onClose={() => {
                setShowVersionSelector(false);
                setSelectedGroupId(null);
              }}
            />
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 'bold', marginBottom: '0.25rem' }}>
                      {currentSong.song?.title}
                    </div>
                    {currentSong.song?.artist && (
                      <div style={{ fontSize: '0.9rem', color: '#666', marginBottom: '0.25rem' }}>
                        {currentSong.song.artist}
                      </div>
                    )}
                    {currentSong.user && (
                      <div style={{ fontSize: '0.85rem', color: '#999' }}>
                        🎤 {currentSong.user.display_name || 'Guest'}
                      </div>
                    )}
                  </div>
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
                    {upNext.song?.title}
                  </div>
                  {upNext.song?.artist && (
                    <div style={{ fontSize: '0.9rem', color: '#666', marginBottom: '0.25rem' }}>
                      {upNext.song.artist}
                    </div>
                  )}
                  {upNext.user && (
                    <div style={{ fontSize: '0.85rem', color: '#999' }}>
                      🎤 {upNext.user.display_name || 'Guest'}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Queue Section (User's Songs Only) */}
          <div style={{ width: '100%', overflow: 'visible' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 'bold', marginBottom: '0.75rem' }}>
              Your Queue
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', width: '100%' }}>
              {userQueue.length > 0 ? (
                userQueue.map((item, index) => (
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
                      <div style={{ fontSize: '0.8rem', color: '#666', marginBottom: '0.25rem' }}>
                        #{index + 1}
                      </div>
                      <div style={{ fontWeight: 'bold', marginBottom: '0.25rem', wordBreak: 'break-word' }}>
                        {item.song?.title}
                      </div>
                      {item.song?.artist && (
                        <div style={{ fontSize: '0.9rem', color: '#666', marginBottom: '0.25rem', wordBreak: 'break-word' }}>
                          {item.song.artist}
                        </div>
                      )}
                    </div>
                    
                    {/* Controls: Up/Down Arrows + Remove Button */}
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexShrink: 0 }}>
                      {/* Up Arrow */}
                      <button
                        onClick={() => handleReorder(item.id, 'up')}
                        disabled={reorderingId === item.id || userQueue.findIndex(q => q.id === item.id) === 0}
                        style={{
                          padding: '0.5rem',
                          background: userQueue.findIndex(q => q.id === item.id) === 0 ? '#f5f5f5' : '#0070f3',
                          border: 'none',
                          borderRadius: '8px',
                          cursor: (reorderingId === item.id || userQueue.findIndex(q => q.id === item.id) === 0) ? 'not-allowed' : 'pointer',
                          fontSize: '1.2rem',
                          lineHeight: 1,
                          minWidth: '44px',
                          minHeight: '44px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'all 0.2s',
                          opacity: (reorderingId === item.id || userQueue.findIndex(q => q.id === item.id) === 0) ? 0.5 : 1,
                          color: 'white',
                        }}
                        title="Move up"
                      >
                        ⬆️
                      </button>
                      
                      {/* Down Arrow */}
                      <button
                        onClick={() => handleReorder(item.id, 'down')}
                        disabled={reorderingId === item.id || userQueue.findIndex(q => q.id === item.id) === userQueue.length - 1}
                        style={{
                          padding: '0.5rem',
                          background: userQueue.findIndex(q => q.id === item.id) === userQueue.length - 1 ? '#f5f5f5' : '#0070f3',
                          border: 'none',
                          borderRadius: '8px',
                          cursor: (reorderingId === item.id || userQueue.findIndex(q => q.id === item.id) === userQueue.length - 1) ? 'not-allowed' : 'pointer',
                          fontSize: '1.2rem',
                          lineHeight: 1,
                          minWidth: '44px',
                          minHeight: '44px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'all 0.2s',
                          opacity: (reorderingId === item.id || userQueue.findIndex(q => q.id === item.id) === userQueue.length - 1) ? 0.5 : 1,
                          color: 'white',
                        }}
                        title="Move down"
                      >
                        ⬇️
                      </button>
                      
                      {/* Remove Button */}
                      <button
                        onClick={() => handleRemoveFromQueue(item.id, item.song?.title || 'Song')}
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
              {history.map((item) => (
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
                      {item.song?.artist || 'Unknown'} • {new Date(item.sung_at).toLocaleDateString()} • 
                      {item.times_sung > 1 && ` (${item.times_sung} times)`}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <button
                      onClick={() => item.song_id && toggleFavorite(item.song_id)}
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
                      title={favoriteSongIds.has(item.song_id) ? 'Remove from favorites' : 'Add to favorites'}
                    >
                      {favoriteSongIds.has(item.song_id) ? '❤️' : '🤍'}
                    </button>
                    <button
                      className="btn btn-sm"
                      onClick={async () => {
                        if (!room || !user || !item.song_id) return;
                        console.log('[History] Add to Queue clicked for song_id:', item.song_id);
                        
                        try {
                          // Get the song group (same as Search tab)
                          const { group } = await api.getSongGroup(item.song_id);
                          console.log('[History] Got song group:', group);
                          // Use the same handleAddToQueue as Search tab
                          handleAddToQueue(group);
                        } catch (err: any) {
                          console.error('[History] Failed to get song group:', err);
                          showError(err.message || 'Failed to find song');
                        }
                      }}
                      style={{ 
                        padding: '0.5rem 1rem',
                        fontSize: '0.9rem',
                      }}
                    >
                      Add to Queue
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Favorites Tab */}
      {activeTab === 'favorites' && (
        <div style={{ padding: '1rem' }}>
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {favorites.map((song) => (
                <div 
                  key={song.id} 
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
                      {song.title}
                    </div>
                    <div style={{ fontSize: '0.85rem', color: '#666' }}>
                      {song.artist || 'Unknown Artist'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <button
                      onClick={() => toggleFavorite(song.id)}
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
                        console.log('[Favorites] Add to Queue clicked for song_id:', song.id);
                        
                        try {
                          // Get the song group (same as Search tab)
                          const { group } = await api.getSongGroup(song.id);
                          console.log('[Favorites] Got song group:', group);
                          // Use the same handleAddToQueue as Search tab
                          handleAddToQueue(group);
                        } catch (err: any) {
                          console.error('[Favorites] Failed to get song group:', err);
                          showError(err.message || 'Failed to find song');
                        }
                      }}
                      style={{ 
                        padding: '0.5rem 1rem',
                        fontSize: '0.9rem',
                      }}
                    >
                      Add to Queue
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Toast Notifications */}
      <ToastContainer />

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

