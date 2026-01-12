'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { getOrCreateFingerprint } from '@/lib/utils';
import type { Room, User, Song, QueueItem, SongGroupResult, GroupVersion, RoomState } from '@/shared/types';

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

// Version Selector Modal Component
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
        background: 'rgba(0,0,0,0.7)',
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
          borderRadius: '12px',
          padding: '1.5rem',
          maxWidth: '500px',
          width: '100%',
          maxHeight: '80vh',
          overflowY: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.5rem' }}>Select Version</h2>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: '1.5rem',
              cursor: 'pointer',
              padding: '0.25rem 0.5rem',
            }}
          >
            ×
          </button>
        </div>
        <div style={{ marginBottom: '1rem', color: '#666' }}>
          <strong>{group.display_title}</strong>
          {group.artists.length > 0 && (
            <div style={{ fontSize: '0.9rem', marginTop: '0.25rem' }}>
              {group.artists.join(', ')}
            </div>
          )}
        </div>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '2rem' }}>Loading versions...</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {versions.map((version) => (
              <button
                key={version.version_id}
                onClick={() => onSelect(version.version_id)}
                style={{
                  padding: '1rem',
                  border: '2px solid #e0e0e0',
                  borderRadius: '8px',
                  background: '#fff',
                  textAlign: 'left',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#0070f3';
                  e.currentTarget.style.background = '#f0f8ff';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = '#e0e0e0';
                  e.currentTarget.style.background = '#fff';
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                      {version.tone && (
                        <span style={{
                          fontSize: '0.75rem',
                          padding: '0.25rem 0.5rem',
                          background: version.tone === 'nam' ? '#e3f2fd' : '#fce4ec',
                          color: version.tone === 'nam' ? '#1976d2' : '#c2185b',
                          borderRadius: '4px',
                          fontWeight: '500',
                        }}>
                          {version.tone.toUpperCase()}
                        </span>
                      )}
                      {version.pitch && (
                        <span style={{
                          fontSize: '0.75rem',
                          padding: '0.25rem 0.5rem',
                          background: '#f5f5f5',
                          color: '#666',
                          borderRadius: '4px',
                        }}>
                          Key: {version.pitch}
                        </span>
                      )}
                      {version.styles.length > 0 && version.styles[0] && (
                        <span style={{
                          fontSize: '0.75rem',
                          padding: '0.25rem 0.5rem',
                          background: '#fff3cd',
                          color: '#856404',
                          borderRadius: '4px',
                        }}>
                          {version.styles[0]}
                        </span>
                      )}
                    </div>
                    {version.duration_s && (
                      <div style={{ fontSize: '0.85rem', color: '#999' }}>
                        Duration: {Math.floor(version.duration_s / 60)}:{(version.duration_s % 60).toString().padStart(2, '0')}
                      </div>
                    )}
                  </div>
                  <div style={{ marginLeft: '1rem' }}>
                    <span style={{ fontSize: '1.2rem' }}>▶</span>
                  </div>
                </div>
              </button>
            ))}
            {versions.length === 0 && (
              <div style={{ textAlign: 'center', padding: '2rem', color: '#666' }}>
                No versions available
              </div>
            )}
          </div>
        )}
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
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'search' | 'queue'>('search');
  const [showNameInput, setShowNameInput] = useState(false);
  
  const roomIdRef = useRef<string | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

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
      
      // Use version_id (preferred) - API will map to song_id internally
      await api.addToQueue({
        room_id: room.id,
        version_id: targetVersionId,
        user_id: user.id,
      });

      setError('');
      // Show success message
      alert(`✅ Added "${group.display_title}" to queue!`);
      // Refresh state to get updated queue (polling will also trigger refresh)
      await refreshRoomState(room.id);
      setShowVersionSelector(false);
      setSelectedGroupId(null);
    } catch (err: any) {
      console.error('[handleAddToQueue] Failed to add to queue:', err);
      const errorMessage = err.message || 'Failed to add song to queue';
      setError(errorMessage);
      alert(`❌ Error: ${errorMessage}`);
    }
  };

  // Remove local queue math - backend is single source of truth
  // Calculate user queue count from backend state (no position calculations)
  const userQueueCount = queue.filter((item) => item.user_id === user?.id).length;

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
            <button className="btn btn-primary" onClick={handleSearch} disabled={searching}>
              {searching ? '...' : 'Search'}
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
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                      {group.best_version.tone && (
                        <span style={{
                          fontSize: '0.75rem',
                          padding: '0.25rem 0.5rem',
                          background: group.best_version.tone === 'nam' ? '#e3f2fd' : '#fce4ec',
                          color: group.best_version.tone === 'nam' ? '#1976d2' : '#c2185b',
                          borderRadius: '4px',
                          fontWeight: '500',
                        }}>
                          {group.best_version.tone.toUpperCase()}
                        </span>
                      )}
                      {group.best_version.pitch && (
                        <span style={{
                          fontSize: '0.75rem',
                          padding: '0.25rem 0.5rem',
                          background: '#f5f5f5',
                          color: '#666',
                          borderRadius: '4px',
                        }}>
                          Key: {group.best_version.pitch}
                        </span>
                      )}
                      {group.available.version_count > 1 && (
                        <span
                          onClick={() => {
                            setSelectedGroupId(group.group_id);
                            setShowVersionSelector(true);
                          }}
                          style={{
                            fontSize: '0.75rem',
                            padding: '0.25rem 0.5rem',
                            background: '#fff3cd',
                            color: '#856404',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            border: '1px solid #ffc107',
                          }}
                        >
                          {group.available.version_count} versions
                        </span>
                      )}
                    </div>
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
                      style={{ padding: '0.5rem 1.5rem' }}
                    >
                      Add
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

          {/* Queue Section (Ledger Order - All Pending Items) */}
          <div style={{ width: '100%', overflow: 'visible' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 'bold', marginBottom: '0.75rem' }}>
              Queue (in order added)
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', width: '100%' }}>
              {queue.length > 0 ? (
                queue.map((item) => (
                  <div
                    key={item.id}
                    className="card"
                    style={{
                      opacity: item.user_id === user.id ? 1 : 0.8,
                      width: '100%',
                      overflow: 'visible', // Ensure buttons aren't clipped
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: '1rem', width: '100%' }}>
                      <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                        <div style={{ fontSize: '0.8rem', color: '#666', marginBottom: '0.25rem' }}>
                          #{item.position}
                        </div>
                        <div style={{ fontWeight: 'bold', marginBottom: '0.25rem', wordBreak: 'break-word' }}>
                          {item.song?.title}
                        </div>
                        {item.song?.artist && (
                          <div style={{ fontSize: '0.9rem', color: '#666', marginBottom: '0.25rem', wordBreak: 'break-word' }}>
                            {item.song.artist}
                          </div>
                        )}
                        {item.user && (
                          <div style={{ fontSize: '0.85rem', color: '#999' }}>
                            🎤 {item.user.display_name || 'Guest'}
                            {item.user_id === user.id && ' (You)'}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#666' }}>
                  Queue is empty. Add some songs!
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

