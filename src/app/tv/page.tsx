'use client';

import { useEffect, useState, useRef, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { v4 as uuidv4 } from 'uuid';
import { api } from '@/lib/api';
import type { ReorderQueueRequest } from '@/shared/types';
import { getQRCodeUrl } from '@/lib/utils';
import QRCode from '@/components/QRCode';
import type { Room, QueueItem } from '@/shared/types';
import { YouTubePlayer, type YouTubePlayerHandle } from '@/components/YouTubePlayer';
import { appConfig } from '@/lib/config';
import { extractYouTubeId } from '@/lib/youtube';
import { connectRoomRealtime, postPlayhead } from '@/lib/realtime-client';
import { isConstrainedTvBrowser } from '@/lib/utils';

/**
 * Format seconds to MM:SS or HH:MM:SS
 */
function formatTime(seconds: number): string {
  if (!isFinite(seconds) || isNaN(seconds)) return '0:00';
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

/**
 * TV Mode - Passive playback client (Checkpoint B)
 * Backend is the only playback authority.
 * TV only:
 * 1. Polls room state every 2.5 seconds
 * 2. Fetches canonical state via getRoomState()
 * 3. Plays the URL from currentSong
 * 4. Reports ended/error to backend
 */
function TVModePageContent() {
  const searchParams = useSearchParams();
  const roomIdParam = searchParams.get('roomId');
  const codeParam = searchParams.get('code');
  
  const [room, setRoom] = useState<Room | null>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [currentSong, setCurrentSong] = useState<QueueItem | null>(null);
  const [upNext, setUpNext] = useState<QueueItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tvUserId, setTvUserId] = useState<string | null>(null); // Host user ID from localStorage
  const [tvId, setTvId] = useState<string | null>(null); // Unique ID for this TV instance
  const [isPrimaryTV, setIsPrimaryTV] = useState(false); // Is this the primary TV (with audio)?
  const [joinedMidSong, setJoinedMidSong] = useState(false); // legacy flag (no longer freezes playback)
  const [seekOffsetSeconds, setSeekOffsetSeconds] = useState(0); // primary mid-song resume only
  const [useRealtime, setUseRealtime] = useState(true); // v4.4: Use Realtime (fallback to polling if false)
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const youtubePlayerRef = useRef<YouTubePlayerHandle | null>(null);
  const lastFollowerSeekAtRef = useRef(0);
  const followerCaughtUpRef = useRef(false);
  const sseUnsubRef = useRef<(() => void) | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [needsUserInteraction, setNeedsUserInteraction] = useState(false);
  const [hasUserInteracted, setHasUserInteracted] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [volume, setVolume] = useState(1);
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showUpNextBanner, setShowUpNextBanner] = useState(false); // v4.5.1: Stable banner visibility
  const [showGoHomeButton, setShowGoHomeButton] = useState(false); // Phase 1: Show "Go Home" button for expired rooms
  
  // Prevent stale refresh overwrites
  const requestIdRef = useRef<number>(0);
  const roomIdRef = useRef<string | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const currentVideoSrcRef = useRef<string | null>(null);
  const currentSongRef = useRef<QueueItem | null>(null);
  const roomRef = useRef<Room | null>(null);
  const playingQueueItemIdRef = useRef<string | null>(null); // Track which queue item ID is actually playing
  const isAdvancingRef = useRef<boolean>(false); // Prevent double-firing of handleEnded
  const isPrimaryTVRef = useRef(false);
  const seekOffsetRef = useRef(0);
  const initialEntryIdRef = useRef<string | null>(null); // v4.4: Track entry ID when TV first connected
  const playbackLockRef = useRef<boolean>(false); // v4.7.1: Prevent concurrent play/pause operations
  const reconnectAttemptsRef = useRef(0); // v4.8.0: Real-time reconnection attempts counter
  const sseRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshInFlightRef = useRef(false);
  const refreshPendingRef = useRef(false);
  const lastUiTimeUpdateRef = useRef(0);

  useEffect(() => {
    isPrimaryTVRef.current = isPrimaryTV;
  }, [isPrimaryTV]);

  useEffect(() => {
    seekOffsetRef.current = seekOffsetSeconds;
  }, [seekOffsetSeconds]);

  // Keep ended-handler ID in sync when reusing YouTube iframe across songs
  useEffect(() => {
    if (currentSong?.id) {
      playingQueueItemIdRef.current = currentSong.id;
    }
  }, [currentSong?.id]);

  // Keep HTML5 mute in sync when primary/secondary flips mid-song
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = !isPrimaryTV;
    }
  }, [isPrimaryTV]);

  type PlayheadPayload = {
    entryId: string;
    t: number;
    paused: boolean;
    wallMs: number;
  };

  // Simple model: primary = clock (SSE). Secondary = mute + follow. No wall/poll clocks.
  const SYNC_INTERVAL_MS = isConstrainedTvBrowser() ? 250 : 150;
  const SYNC_DRIFT_SEC = 1.5;
  const SEEK_COOLDOWN_MS = 2000;
  const PLAYHEAD_STALE_MS = 2000;

  const readLocalPlayhead = useCallback((): {
    t: number;
    paused: boolean;
    state: number | null;
  } | null => {
    const yt = youtubePlayerRef.current;
    if (yt) {
      const state = yt.getPlayerState();
      return {
        t: yt.getCurrentTime(),
        paused: state === 2 || state === -1,
        state,
      };
    }
    const video = videoRef.current;
    if (video && video.src) {
      return { t: video.currentTime || 0, paused: video.paused, state: null };
    }
    return null;
  }, []);

  const applyFollowerPlayhead = useCallback((payload: PlayheadPayload) => {
    if (isPrimaryTVRef.current) return;
    if (!payload.entryId || !Number.isFinite(payload.t) || payload.t < 0) return;

    const now = Date.now();
    const wallMs = typeof payload.wallMs === 'number' ? payload.wallMs : now;
    const ageMs = now - wallMs;
    if (ageMs > PLAYHEAD_STALE_MS) return;

    const currentId = currentSongRef.current?.id;
    if (!currentId || payload.entryId !== currentId) return;

    const yt = youtubePlayerRef.current;
    const video = videoRef.current;
    if (!yt && !(video && video.src)) return;

    const local = readLocalPlayhead();
    if (local?.state === 3) return;

    const target = payload.t;
    const localT = local?.t ?? 0;
    const drift = Math.abs(localT - target);
    const firstCatchUp = !followerCaughtUpRef.current;
    const canSeek =
      (firstCatchUp && drift > 0.5) ||
      (drift > SYNC_DRIFT_SEC && now - lastFollowerSeekAtRef.current >= SEEK_COOLDOWN_MS);

    if (canSeek) {
      lastFollowerSeekAtRef.current = now;
      followerCaughtUpRef.current = true;
      console.log('[tv] Follow seek', { from: localT.toFixed(1), to: target.toFixed(1) });
      if (yt) yt.seekTo(target);
      else if (video) {
        try {
          video.currentTime = target;
        } catch {
          /* ignore */
        }
      }
    } else if (!followerCaughtUpRef.current) {
      followerCaughtUpRef.current = true;
    }

    if (yt) {
      const state = local?.state ?? null;
      if (payload.paused && state !== 2) yt.pause();
      else if (!payload.paused && (state === 2 || state === -1 || state === 5)) yt.play();
    } else if (video) {
      if (payload.paused && !video.paused) video.pause();
      else if (!payload.paused && video.paused) video.play().catch(() => {});
    }
  }, [readLocalPlayhead]);

  // Primary only: publish playhead. Secondary follows via SSE onPlayhead (no poll / wall).
  useEffect(() => {
    const roomId = room?.id;
    if (!roomId) return;

    const primaryTick = window.setInterval(() => {
      if (!isPrimaryTVRef.current) return;
      const entryId = currentSongRef.current?.id;
      if (!entryId) return;
      const local = readLocalPlayhead();
      if (!local) return;
      postPlayhead({
        roomId,
        entryId,
        t: local.t,
        paused: local.paused,
        wallMs: Date.now(),
      });
    }, SYNC_INTERVAL_MS);

    return () => window.clearInterval(primaryTick);
  }, [room?.id, readLocalPlayhead]);

  const getTvAdvanceOpts = () => {
    const id = tvId || (typeof window !== 'undefined' ? localStorage.getItem('tv_id') : null);
    return id ? { tvId: id } : {};
  };
  
  // v4.8.0: Real-time constants
  const MAX_RECONNECT_ATTEMPTS = 5;
  const RECONNECT_DELAY_MS = 5000; // 5 seconds between reconnection attempts
  const FALLBACK_POLLING_INTERVAL = 7500; // 7.5 seconds (slower polling for fallback)

  // Load room from localStorage or URL - setup polling
  useEffect(() => {
    const storedRoomId = localStorage.getItem('tv_room_id');
    const storedUserId = localStorage.getItem('tv_user_id'); // Host user ID

    // Load host user ID
    if (storedUserId) {
      setTvUserId(storedUserId);
      console.log('[tv] Loaded host user ID from localStorage:', storedUserId);
    }

    // Generate or load unique TV ID
    let currentTvId = localStorage.getItem('tv_id');
    if (!currentTvId) {
      // Generate new UUID for this TV
      currentTvId = uuidv4();
      localStorage.setItem('tv_id', currentTvId);
      console.log('[tv] Generated new TV ID:', currentTvId);
    } else {
      console.log('[tv] Loaded TV ID from localStorage:', currentTvId);
    }
    setTvId(currentTvId);

    // Resolve room: code > roomId param > localStorage
    const resolveAndLoadRoom = async () => {
      let roomId: string | null = null;

      // Priority 1: Resolve code to roomId
      if (codeParam) {
        const code = codeParam.toUpperCase();
        console.log('[tv] Resolving code:', code);
        try {
          const response = await fetch(`/api/rooms/code/${code}`);
          if (response.ok) {
            const data = await response.json();
            roomId = data.room.id as string;
            console.log('[tv] Resolved code to roomId:', roomId);
            // Save to localStorage for future loads
            localStorage.setItem('tv_room_id', roomId);
          } else {
            // Phase 1: Check if room expired or not found (410/404)
            const isRoomExpired = response.status === 410 || response.status === 404;
            if (isRoomExpired) {
              setError('Room expired or doesn\'t exist. Host needs to create a new room.');
              setShowGoHomeButton(true);
            } else {
              // Real app error - preserve original message
              const errorData = await response.json().catch(() => ({ error: 'Room not found' }));
              setError(errorData.error || `Room code "${code}" not found`);
            }
            setLoading(false);
            return;
          }
        } catch (err: any) {
          console.error('[tv] Error resolving code:', err);
          // Phase 1: Check if it's a room expiry error
          const isRoomExpired = err.status === 410 || err.status === 404;
          if (isRoomExpired) {
            setError('Room expired or doesn\'t exist. Host needs to create a new room.');
            setShowGoHomeButton(true);
          } else {
            // Real app error - preserve original message
            setError(err.message || 'Failed to resolve room code');
          }
          setLoading(false);
          return;
        }
      }
      // Priority 2: Direct roomId param
      else if (roomIdParam) {
        roomId = roomIdParam;
        localStorage.setItem('tv_room_id', roomId);
      }
      // Priority 3: localStorage
      else if (storedRoomId) {
        roomId = storedRoomId;
      }

      if (!roomId) {
        setError('No room ID or code found. Please scan QR code or create a room first.');
        setLoading(false);
        return;
      }

      // Cleanup previous polling if roomId changed
      if (pollingIntervalRef.current && roomIdRef.current !== roomId) {
        console.log('[tv] Room ID changed, cleaning up previous polling');
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }

      loadRoom(roomId);
    };

    resolveAndLoadRoom();
    
    // Cleanup on unmount or roomId change
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
      if (sseUnsubRef.current) {
        sseUnsubRef.current();
        sseUnsubRef.current = null;
      }
      reconnectAttemptsRef.current = 0;
    };
  }, [codeParam, roomIdParam]);

  // Leave page warning (v4.3)
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = ''; // Required for Chrome
      return 'Are you sure you want to leave? This will close the TV display.';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  const playerTimeRef = useRef(0);
  const playerDurationRef = useRef(0);
  const ytPlayerStateRef = useRef<number | null>(null);
  const bannerLoggedSongRef = useRef<string | null>(null);

  // Reset progress when the playing queue item changes (YouTube remounts don't clear parent state)
  useEffect(() => {
    setCurrentTime(0);
    setDuration(0);
    setShowUpNextBanner(false);
    playerTimeRef.current = 0;
    playerDurationRef.current = 0;
    ytPlayerStateRef.current = null;
    bannerLoggedSongRef.current = null;
  }, [currentSong?.id]);

  useEffect(() => {
    playerTimeRef.current = currentTime;
  }, [currentTime]);

  useEffect(() => {
    if (duration > 0) playerDurationRef.current = duration;
  }, [duration]);

  // Up Next banner: last 90s. Wall-clock blended with player time so YT pause/buffer
  // cannot freeze remaining (prod logs: timeRemaining stuck at ~34s while state=PAUSED).
  useEffect(() => {
    if (!upNext || !currentSong) {
      setShowUpNextBanner(false);
      return;
    }

    const evaluate = () => {
      const metaDuration =
        (typeof currentSong.duration === 'number' && currentSong.duration > 0
          ? currentSong.duration
          : null) ||
        (typeof currentSong.song?.duration === 'number' && currentSong.song.duration > 0
          ? currentSong.song.duration
          : null) ||
        0;
      const effectiveDuration =
        playerDurationRef.current > 0 ? playerDurationRef.current : metaDuration;

      if (!Number.isFinite(effectiveDuration) || effectiveDuration <= 0) {
        setShowUpNextBanner(false);
        return;
      }

      const startedAt =
        roomRef.current?.current_song_started_at || currentSong.started_at || null;
      let wallElapsed = 0;
      if (startedAt) {
        wallElapsed = (Date.now() - new Date(startedAt).getTime()) / 1000;
        if (!Number.isFinite(wallElapsed) || wallElapsed < 0) wallElapsed = 0;
      }

      const playerTime = playerTimeRef.current;
      const ytState = ytPlayerStateRef.current;
      // -1 unstarted, 2 paused, 3 buffering — player clock often stalls
      const playerStalled = ytState === -1 || ytState === 2 || ytState === 3;

      let effectiveTime = playerTime;
      if (wallElapsed > 0 && (playerStalled || wallElapsed > playerTime + 1.5)) {
        effectiveTime = Math.max(playerTime, wallElapsed);
      }
      effectiveTime = Math.min(Math.max(0, effectiveTime), effectiveDuration);

      const timeRemaining = effectiveDuration - effectiveTime;
      setShowUpNextBanner((visible) => {
        if (timeRemaining <= 0.5) return false;
        if (!visible && timeRemaining <= 90) {
          if (bannerLoggedSongRef.current !== currentSong.id) {
            bannerLoggedSongRef.current = currentSong.id;
            console.log('[tv] Up Next banner on', {
              title: upNext.title,
              singer: upNext.user_name,
              timeRemaining,
              effectiveDuration,
              playerTime,
              wallElapsed,
              ytState,
            });
          }
          return true;
        }
        if (visible && timeRemaining <= 95) return true;
        return false;
      });
    };

    evaluate();
    const id = setInterval(evaluate, 1000);
    return () => clearInterval(id);
  }, [upNext, currentSong]);

  // v4.6.0: Sidebar removed - QR code now always visible

  /**
   * Deterministic refresh function (canonical HTTP fetch)
   * Fetches complete room state from backend (single source of truth)
   * Always renders the song referenced by room.current_entry_id (single source of truth)
   * Uses requestIdRef to prevent stale overwrites
   * Memoized with useCallback to ensure stable reference for debounced function
   */
  const refreshState = useCallback(async (roomId: string) => {
    // Coalesce: Smart TVs die when NOTIFY storms stack concurrent getRoomState calls
    if (refreshInFlightRef.current) {
      refreshPendingRef.current = true;
      return;
    }
    refreshInFlightRef.current = true;
    try {
      do {
        refreshPendingRef.current = false;
        const requestId = ++requestIdRef.current;
        try {
          const state = await api.getRoomState(roomId, tvUserId || undefined);

          if (initialEntryIdRef.current && state.room.current_entry_id !== initialEntryIdRef.current) {
            setJoinedMidSong(false);
            initialEntryIdRef.current = null;
          }

          if (requestId === requestIdRef.current) {
            const prevEntryId = roomRef.current?.current_entry_id;
            const nextEntryId = state.room.current_entry_id;
            const sameSong =
              prevEntryId != null &&
              nextEntryId != null &&
              prevEntryId === nextEntryId &&
              currentSongRef.current?.id === state.currentSong?.id;

            setRoom(state.room);
            roomRef.current = state.room;
            // Keep player object stable when same entry — avoids hitch/restart on soft refreshes
            if (!sameSong) {
              setCurrentSong(state.currentSong);
              currentSongRef.current = state.currentSong;
            } else if (state.currentSong) {
              currentSongRef.current = state.currentSong;
            }
            setQueue(state.queue);
            setUpNext(state.upNext);
            // New song: reset follower catch-up; secondary waits for playhead (no wall seek)
            if (nextEntryId !== prevEntryId) {
              setSeekOffsetSeconds(0);
              seekOffsetRef.current = 0;
              followerCaughtUpRef.current = false;
            }
          }
        } catch (err: any) {
          if (requestId === requestIdRef.current) {
            console.error('Failed to refresh room state:', err);
            const isRoomExpired = err.status === 410 || err.status === 404;
            if (isRoomExpired) {
              setError('Room expired or doesn\'t exist. Host needs to create a new room.');
              setShowGoHomeButton(true);
              setRoom(null);
              setCurrentSong(null);
            } else {
              setError(err.message || 'Failed to refresh room state');
              setShowGoHomeButton(false);
            }
          }
        }
      } while (refreshPendingRef.current);
    } finally {
      refreshInFlightRef.current = false;
    }
  }, []); // Empty deps - only uses stable setState functions and refs

  /**
   * Start polling room state
   * Polls refreshState every 2.5 seconds
   */
  /**
   * Start polling room state (fallback mode)
   */
  const startPolling = useCallback((roomId: string, interval: number = FALLBACK_POLLING_INTERVAL) => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }

    console.log(`[tv] Starting polling fallback (${interval}ms interval)`);
    refreshState(roomId);
    pollingIntervalRef.current = setInterval(() => {
      const currentRoomId = roomIdRef.current;
      if (currentRoomId) {
        console.log('[tv] Polling refreshState');
        refreshState(currentRoomId);
      }
    }, interval);
  }, [refreshState]);

  /**
   * SSE realtime: room/queue NOTIFY fanout + playhead packets
   */
  const subscribeToRoom = useCallback((roomId: string) => {
    if (sseUnsubRef.current) {
      sseUnsubRef.current();
      sseUnsubRef.current = null;
    }

    console.log('[tv] Setting up SSE realtime for room:', roomId);
    let errorCount = 0;

    const unsub = connectRoomRealtime(roomId, {
      onReady: () => {
        console.log('[tv] ✅ SSE realtime connected');
        errorCount = 0;
        reconnectAttemptsRef.current = 0;
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }
      },
      onRoom: (payload) => {
        // Soft presence: never let another TV's register hitch primary playback
        const soft =
          payload?.event === 'tv_register' || payload?.event === 'tv_presence';
        if (soft && isPrimaryTVRef.current) {
          return;
        }
        // Debounce NOTIFY storms — longer on Smart TVs to avoid main-thread jank
        const debounceMs = isConstrainedTvBrowser() ? 900 : 500;
        if (sseRefreshTimerRef.current) clearTimeout(sseRefreshTimerRef.current);
        sseRefreshTimerRef.current = setTimeout(() => {
          refreshState(roomId).then(() => {
            const currentTvId = localStorage.getItem('tv_id');
            const primaryId = roomRef.current?.primary_tv_id;
            if (currentTvId && primaryId) {
              const isNowPrimary = primaryId === currentTvId;
              if (isNowPrimary !== isPrimaryTVRef.current) {
                setIsPrimaryTV(isNowPrimary);
              }
            }
          });
        }, debounceMs);
      },
      onPlayhead: (payload) => {
        // Primary ignores playhead; skip work on the posting device (Samsung primary)
        if (isPrimaryTVRef.current || !payload.entryId) return;
        applyFollowerPlayhead({
          entryId: payload.entryId,
          t: payload.t,
          paused: payload.paused,
          wallMs: payload.wallMs,
        });
      },
      onError: () => {
        errorCount += 1;
        console.error('[tv] ❌ SSE realtime error', errorCount);
        if (errorCount >= MAX_RECONNECT_ATTEMPTS) {
          console.error('[tv] Max SSE errors — falling back to polling');
          setUseRealtime(false);
          unsub();
          sseUnsubRef.current = null;
          startPolling(roomId, FALLBACK_POLLING_INTERVAL);
        }
      },
    });

    sseUnsubRef.current = () => {
      if (sseRefreshTimerRef.current) {
        clearTimeout(sseRefreshTimerRef.current);
        sseRefreshTimerRef.current = null;
      }
      unsub();
    };
  }, [refreshState, applyFollowerPlayhead, startPolling]);

  const loadRoom = async (roomId: string) => {
    try {
      // Initial load
      await refreshState(roomId);
      localStorage.setItem('tv_room_id', roomId);
      roomIdRef.current = roomId;
      
      // Ensure host user ID is stored (if room was just created)
      const storedUserId = localStorage.getItem('tv_user_id');
      if (storedUserId) {
        setTvUserId(storedUserId);
      }
      
      // Register as primary TV if no primary exists (v4.3)
      const currentTvId = localStorage.getItem('tv_id');
      let isPrimary = false;
      if (currentTvId) {
        try {
          const response = await fetch(`/api/rooms/${roomId}/register-tv`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tv_id: currentTvId }),
          });
          
          if (response.ok) {
            const data = await response.json();
            isPrimary = data.is_primary;
            setIsPrimaryTV(isPrimary);
            console.log('[tv] Registered as', isPrimary ? 'PRIMARY' : 'SECONDARY', 'TV');
          }
        } catch (err) {
          console.error('[tv] Failed to register TV:', err);
          // Default to secondary if registration fails
          setIsPrimaryTV(false);
        }
      }
      
      // Secondary: start at 0 muted, catch up on first SSE playhead. Primary starts normally.
      followerCaughtUpRef.current = isPrimary;
      setSeekOffsetSeconds(0);
      seekOffsetRef.current = 0;
      if (isPrimary) {
        console.log('[tv] ✅ Primary — clock source for room');
      } else {
        console.log('[tv] Secondary — waiting for SSE playhead from primary');
      }
      setJoinedMidSong(false);
      initialEntryIdRef.current = null;
      
      // v4.4: Use Realtime subscription with polling fallback
      // v4.8.0: Reset reconnect attempts on room load
      reconnectAttemptsRef.current = 0;
      
      if (useRealtime) {
        subscribeToRoom(roomId);
      } else {
        startPolling(roomId, FALLBACK_POLLING_INTERVAL);
      }
      
      setLoading(false);
    } catch (err: any) {
      // Phase 1: Check if it's a room expiry error (410 or 404)
      const isRoomExpired = err.status === 410 || err.status === 404;
      if (isRoomExpired) {
        setError('Room expired or doesn\'t exist. Host needs to create a new room.');
        setShowGoHomeButton(true);
        setRoom(null); // Clear room so error display shows
      } else {
        // Real app error - preserve original message for troubleshooting
        setError(err.message || 'Failed to load room');
        setShowGoHomeButton(false);
      }
      setLoading(false);
    }
  };

  // Calculate if current TV session is the host
  const isHost = room && tvUserId && room.host_id === tvUserId;

  /**
   * Manual advance handler for "Play Next" button
   */
  const handleManualAdvance = async () => {
    if (!room) return;
    if (!isPrimaryTVRef.current) {
      setError('Only primary TV can skip');
      return;
    }
    
    console.log('[tv] Manual advance triggered');
    try {
      await api.advancePlayback(room.id, getTvAdvanceOpts());
      console.log('[tv] /advance succeeded (manual)');
    } catch (err: any) {
      console.error('[tv] Failed to advance manually:', err);
      setError('Failed to skip to next song');
    }
  };

  /**
   * Handle video timeupdate event - stable callback for both addEventListener and onTimeUpdate prop
   * This ensures progress bar updates continuously (like fullscreen)
   */
  const handleTimeUpdate = useCallback(() => {
    const currentVideo = videoRef.current;
    if (currentVideo && isFinite(currentVideo.currentTime) && currentVideo.currentTime >= 0) {
      // Always update - this is what fullscreen uses
      setCurrentTime(currentVideo.currentTime);
    }
  }, []);

  /**
   * Handle playback error - advance to next song
   */
  const handlePlaybackError = useCallback(async () => {
    console.error('[tv] Playback error - advancing to next song');
    setError('Playback error - skipping to next song');

    if (!isPrimaryTVRef.current) {
      console.log('[tv] Secondary TV — not advancing after error');
      return;
    }
    
    const latestRoom = roomRef.current;
    if (latestRoom) {
      try {
        const id = typeof window !== 'undefined' ? localStorage.getItem('tv_id') : null;
        await api.advancePlayback(latestRoom.id, id ? { tvId: id } : {});
        console.log('[tv] /advance succeeded after error');
        setTimeout(() => setError(''), 3000);
      } catch (err) {
        console.error('[tv] Failed to advance after error:', err);
      }
    }
  }, []);

  /**
   * Handle video ended event - stable callback for both addEventListener and onEnded prop
   */
  const handleEnded = useCallback(async () => {
    console.log('[tv] onEnded fired');
    
    // Prevent double-firing (both addEventListener and onEnded prop might fire)
    if (isAdvancingRef.current) {
      console.log('[tv] onEnded already processing, ignoring duplicate event');
      return;
    }
    
    // Use refs to get latest values (not closure values)
    const latestRoom = roomRef.current;
    const latestCurrentSong = currentSongRef.current;
    const playingQueueItemId = playingQueueItemIdRef.current;
    
    if (!latestRoom) {
      console.warn('[tv] onEnded fired but no room');
      return;
    }
    
    // CRITICAL: Verify that the ended video matches the DB's current song
    // This prevents marking wrong songs as completed when video element is out of sync
    if (latestCurrentSong && playingQueueItemId !== latestCurrentSong.id) {
      console.warn('[tv] onEnded fired but video element is playing different song:', {
        playingQueueItemId,
        currentSongId: latestCurrentSong.id,
        message: 'Ignoring onEnded - video element out of sync with DB'
      });
      return;
    }

    // Only primary TV advances — secondaries follow via Realtime
    if (!isPrimaryTVRef.current) {
      console.log('[tv] Secondary TV onEnded — waiting for primary to advance');
      return;
    }
    
    // Mark as processing to prevent double-firing
    isAdvancingRef.current = true;
    
    console.log('[tv] onEnded verified - calling /advance for room:', latestRoom.id, 'queue item:', playingQueueItemId);
    try {
      const id = typeof window !== 'undefined' ? localStorage.getItem('tv_id') : null;
      await api.advancePlayback(latestRoom.id, id ? { tvId: id } : {});
      console.log('[tv] /advance succeeded');
      playingQueueItemIdRef.current = null;
      currentVideoSrcRef.current = null;
      if (latestRoom.id) {
        await refreshState(latestRoom.id);
      }
    } catch (err: any) {
      console.error('[tv] Failed to advance playback:', err);
      setError('Failed to advance to next song');
    } finally {
      setTimeout(() => {
        isAdvancingRef.current = false;
      }, 500);
    }
  }, [refreshState]);

  /**
   * Video element handling
   * Reloads video when media_url changes (key={media_url} forces remount)
   * Must reload on currentSong.song.media_url change: key={media_url} + effect sets src, load(), play()
   * Prevents unnecessary reloads when the same URL is set repeatedly
   */
  useEffect(() => {
    if (!videoRef.current) {
      console.log('[tv] Video effect: no video ref');
      return;
    }
    if (!currentSong?.song?.media_url) {
      console.log('[tv] Video effect: no media_url');
      return;
    }

    const video = videoRef.current;
    const mediaUrl = currentSong.song.media_url;
    const queueItemId = currentSong.id;

    // Only reload if the URL OR queue item ID actually changed
    // This ensures we reload when a different queue item (even with same media_url) becomes current
    // Also reload if playingQueueItemIdRef is null (after advance, before new song starts)
    if (currentVideoSrcRef.current === mediaUrl && playingQueueItemIdRef.current === queueItemId && playingQueueItemIdRef.current !== null) {
      console.log('[tv] Video URL and queue item ID unchanged, skipping reload:', mediaUrl, queueItemId);
      return;
    }

    // Preserve current volume before reload (important for iOS)
    const currentVolume = video.volume;
    // Secondary TVs must stay muted (HTML5 path)
    const wasMuted = !isPrimaryTVRef.current;

    // Update tracked URL and queue item ID, then reload
    console.log('[tv] set video src:', mediaUrl, 'for queue item:', queueItemId);
    currentVideoSrcRef.current = mediaUrl;
    playingQueueItemIdRef.current = queueItemId;
    // Reset time tracking when new video loads
    setCurrentTime(0);
    setDuration(0);
    video.src = mediaUrl;
    
    // Restore volume BEFORE load() to prevent iOS from resetting it
    video.volume = currentVolume;
    video.muted = wasMuted;
    
    video.load();
    // Note: play() is called in handleLoadedData when video is ready

    const handleLoadedData = () => {
      const currentVideo = videoRef.current;
      if (!currentVideo) return;
      
      // Restore volume again after load (iOS sometimes resets it)
      currentVideo.volume = currentVolume;
      currentVideo.muted = wasMuted;
      
      console.log('[tv] Video loaded, attempting to play for queue item:', queueItemId, 'volume:', currentVolume, 'muted:', wasMuted);
      // After media_url change: set video.src, load(), attempt play()
      // Use setTimeout to ensure video is fully ready (fixes autoplay timing issue)
      setTimeout(() => {
        // v4.7.1: Check lock to prevent race with manual play/pause button
        if (playbackLockRef.current) {
          console.log('[tv] Skipping auto-play, playback operation in progress');
          return;
        }
        playbackLockRef.current = true;
        currentVideo.play().then(() => {
          console.log('[tv] Play() succeeded for queue item:', queueItemId);
          // Mark this queue item as the one actually playing
          playingQueueItemIdRef.current = queueItemId;
          // Final volume restore after playback starts (for iOS)
          currentVideo.volume = currentVolume;
          currentVideo.muted = wasMuted;
        }).catch((err: any) => {
          console.error('[tv] Failed to play video:', err);
          if (err.name === 'NotAllowedError') {
            // Autoplay blocked - show overlay requiring one click then retry play()
            console.log('[tv] Autoplay blocked - showing user interaction overlay');
            setNeedsUserInteraction(true);
            setHasUserInteracted(false);
          } else {
            setError(`Failed to play video: ${err.message}`);
            // On playback error, skip to next song
            if (room && isPrimaryTVRef.current) {
              const id = typeof window !== 'undefined' ? localStorage.getItem('tv_id') : null;
              api.advancePlayback(room.id, id ? { tvId: id } : {}).catch(console.error);
            }
          }
        }).finally(() => {
          playbackLockRef.current = false; // Release lock
        });
      }, 100); // Small delay to ensure video element is ready
    };

    const handlePlay = () => {
      const currentVideo = videoRef.current;
      if (!currentVideo) return;
      
      console.log('Video started playing');
      setIsPlaying(true);
      setNeedsUserInteraction(false);
      setError('');
      // Update current time immediately when play starts
      setCurrentTime(currentVideo.currentTime);
      // Ensure volume is still correct after play starts (iOS safeguard)
      currentVideo.volume = currentVolume;
      currentVideo.muted = wasMuted;
      // Hide controls after starting to play
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, 3000);
    };

    const handlePause = () => {
      const currentVideo = videoRef.current;
      if (!currentVideo) return;
      
      console.log('Video paused');
      setIsPlaying(false);
      // Update current time when paused
      setCurrentTime(currentVideo.currentTime);
    };

    // Use the stable handleEnded callback from useCallback
    // Also attach via onEnded prop for reliability (React manages this internally)
    // This ensures the event fires even if the element is remounted
    video.onended = handleEnded;

    const handleError = async (e: any) => {
      console.error('[tv] Video error:', e);
      setError('Video playback error - skipping to next song');
      
      const latestRoom = roomRef.current;
      if (latestRoom && isPrimaryTVRef.current) {
        try {
          const id = typeof window !== 'undefined' ? localStorage.getItem('tv_id') : null;
          await api.advancePlayback(latestRoom.id, id ? { tvId: id } : {});
          console.log('[tv] /advance succeeded after error');
        } catch (err) {
          console.error('[tv] Failed to advance after error:', err);
        }
      }
    };

    const handleLoadedMetadata = () => {
      const currentVideo = videoRef.current;
      if (currentVideo) {
        setDuration(currentVideo.duration);
        const offset = seekOffsetRef.current;
        if (offset > 2 && currentVideo.duration && offset < currentVideo.duration - 1) {
          currentVideo.currentTime = offset;
          console.log('[tv] HTML5 seeked to', offset, 's for multi-TV sync');
        }
      }
    };

    video.addEventListener('loadeddata', handleLoadedData);
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('ended', handleEnded);
    video.addEventListener('error', handleError);
    
    console.log('[tv] Video event listeners attached, currentSong:', currentSong?.id);

    // Set volume
    video.volume = volume;

    // Handle fullscreen changes
    const handleFullscreenChange = () => {
      setIsFullscreen(
        !!(document.fullscreenElement ||
          (document as any).webkitFullscreenElement ||
          (document as any).mozFullScreenElement)
      );
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);

    return () => {
      video.removeEventListener('loadeddata', handleLoadedData);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      // Note: onTimeUpdate prop is handled by React, no need to remove
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('ended', handleEnded);
      video.removeEventListener('error', handleError);
      // Clear onEnded prop handler
      video.onended = null;
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
    };
  }, [currentSong?.id, currentSong?.song?.media_url, room, volume, handleEnded, handleTimeUpdate]);

  // Mouse movement to show controls
  useEffect(() => {
    const handleMouseMove = () => {
      setShowControls(true);
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, 3000);
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <div>Loading room...</div>
      </div>
    );
  }

  if (error && !currentSong) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', flexDirection: 'column', gap: '1rem', padding: '2rem', textAlign: 'center' }}>
        <div style={{ fontSize: '1.5rem', color: '#e00', marginBottom: '1rem' }}>{error}</div>
        {/* Phase 1: Go Home button for expired rooms */}
        {showGoHomeButton ? (
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
        ) : (
          <button 
            onClick={() => room && loadRoom(room.id)}
            style={{
              padding: '1rem 2rem',
              background: '#0070f3',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '1.1rem',
              fontWeight: 'bold',
              cursor: 'pointer',
            }}
          >
            Retry
          </button>
        )}
      </div>
    );
  }

  if (!room) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <div>Room not found</div>
      </div>
    );
  }

  // Check if current song is YouTube (v4.0)
  const isYouTubeSong = currentSong?.source_type === 'youtube' && currentSong?.youtube_url;
  
  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', background: '#000', overflow: 'hidden' }}>
      {/* Video Container - Full screen */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' }}>
        {/* YouTube Player (v4.0 Commercial Mode) */}
        {isYouTubeSong && currentSong?.youtube_url && (
          <YouTubePlayer
            ref={youtubePlayerRef}
            videoUrl={currentSong.youtube_url}
            onReady={() => {
              playingQueueItemIdRef.current = currentSong.id;
              console.log('[TV] YouTube player ready, tracking queue item:', currentSong.id);
            }}
            onEnded={isPrimaryTV ? handleEnded : undefined}
            onError={(code) => {
              console.error('[TV] YouTube error:', code);
              if (isPrimaryTVRef.current) handlePlaybackError();
            }}
            onStateChange={(state) => {
              ytPlayerStateRef.current = state;
            }}
            onTimeUpdate={(current, dur) => {
              if (Number.isFinite(current)) {
                playerTimeRef.current = current;
              }
              if (Number.isFinite(dur) && dur > 0) {
                playerDurationRef.current = dur;
              }
              // Throttle React state updates — full TV tree re-render every 250ms kills Smart TVs
              const now = Date.now();
              if (now - lastUiTimeUpdateRef.current < 1000) return;
              lastUiTimeUpdateRef.current = now;
              if (Number.isFinite(current)) setCurrentTime(current);
              if (Number.isFinite(dur) && dur > 0) setDuration(dur);
            }}
            autoPlay={true}
            muted={!isPrimaryTV}
            controls={false}
            startAtSeconds={seekOffsetSeconds}
            width="100%"
            height="100%"
          />
        )}
        
        {/* HTML5 Video Player (v3.5 Database Mode) */}
        {!isYouTubeSong && (
          <video
            key={`${currentSong?.id || 'no-video'}-${currentSong?.song?.media_url || ''}`}
            ref={videoRef}
            autoPlay
            playsInline
            muted={!isPrimaryTV}
            controls={false}
            onEnded={isPrimaryTV ? handleEnded : undefined}
            onTimeUpdate={handleTimeUpdate}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              pointerEvents: isPrimaryTV ? 'auto' : 'none',
            }}
          />
        )}

      {/* User Interaction Overlay (for autoplay) */}
      {needsUserInteraction && !hasUserInteracted && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.8)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 2000,
          }}
          onClick={async () => {
            if (videoRef.current && !playbackLockRef.current) {
              playbackLockRef.current = true; // v4.7.1: Lock to prevent race conditions
              try {
                console.log('[tv] User interaction - retrying play()');
                await videoRef.current.play();
                console.log('[tv] Play() succeeded after user interaction');
                setHasUserInteracted(true);
                setNeedsUserInteraction(false);
              } catch (err) {
                console.error('[tv] Failed to play after user interaction:', err);
              } finally {
                playbackLockRef.current = false; // Release lock
              }
            }
          }}
        >
          <button
            style={{
              fontSize: '2rem',
              padding: '1rem 2rem',
              background: '#fff',
              color: '#000',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
            }}
          >
            ▶ Play
          </button>
        </div>
      )}

      {/* TV Mode Badge - Top Left (v4.3): single dropdown for Primary/Secondary */}
      {appConfig.commercialMode && (
        <div
          style={{
            position: 'absolute',
            top: '1rem',
            left: '1rem',
            background: isPrimaryTV
              ? 'linear-gradient(135deg, rgba(0, 255, 0, 0.9), rgba(0, 200, 0, 0.9))'
              : 'linear-gradient(135deg, rgba(100, 100, 100, 0.9), rgba(60, 60, 60, 0.9))',
            color: 'white',
            padding: '0.4rem 0.75rem',
            borderRadius: '8px',
            fontSize: '0.9rem',
            fontWeight: 'bold',
            zIndex: 1100,
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
          }}
        >
          {room && tvId && room.host_id ? (() => {
            const connectedTvs = (room as any).connected_tv_ids || [];
            const hasOtherTvs = connectedTvs.length > 1;
            return (
              <select
                value={isPrimaryTV ? 'primary' : 'secondary'}
                onChange={async (e) => {
                  const newMode = e.target.value;
                  if (newMode === (isPrimaryTV ? 'primary' : 'secondary')) return;

                  try {
                    const hostId = room.host_id;
                    if (!hostId) {
                      alert('Room host not found');
                      return;
                    }

                    if (newMode === 'primary') {
                      const res = await fetch(`/api/rooms/${room.id}/set-primary-tv`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ user_id: hostId, tv_id: tvId }),
                      });
                      if (!res.ok) {
                        const err = await res.json().catch(() => ({}));
                        throw new Error(err.error || 'Failed to set primary TV');
                      }
                    } else {
                      if (!hasOtherTvs) {
                        alert('Cannot switch to secondary: No other TVs connected. Connect another TV first.');
                        return;
                      }
                      const otherTv = connectedTvs.find((id: string) => id !== tvId);
                      if (otherTv) {
                        const res = await fetch(`/api/rooms/${room.id}/set-primary-tv`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ user_id: hostId, tv_id: otherTv }),
                        });
                        if (!res.ok) {
                          const err = await res.json().catch(() => ({}));
                          throw new Error(err.error || 'Failed to set primary TV');
                        }
                      }
                    }
                  } catch (err: any) {
                    console.error('[tv] Failed to change TV mode:', err);
                    alert(err.message || 'Failed to change TV mode');
                  }
                }}
                style={{
                  padding: '0.2rem 0.4rem',
                  borderRadius: '6px',
                  border: '1px solid rgba(255, 255, 255, 0.5)',
                  background: 'rgba(255, 255, 255, 0.2)',
                  color: 'white',
                  fontSize: '0.85rem',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  appearance: 'none',
                  WebkitAppearance: 'none',
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='white' d='M6 8L2 4h8z'/%3E%3C/svg%3E")`,
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 0.35rem center',
                  paddingRight: '1.5rem',
                }}
              >
                <option value="primary" style={{ color: '#333' }}>🔊 Primary (Audio)</option>
                <option value="secondary" style={{ color: '#333' }} disabled={!hasOtherTvs}>
                  📺 Secondary {!hasOtherTvs ? '(Need another TV)' : '(No Audio)'}
                </option>
              </select>
            );
          })() : (
            <span style={{ fontSize: '0.85rem' }}>
              {isPrimaryTV ? '🔊 Primary (Audio)' : '📺 Secondary (No Audio)'}
            </span>
          )}
        </div>
      )}

      {/* Song Title and User Name - Below badge */}
      {showControls && currentSong && !needsUserInteraction && (
        <div
          style={{
            position: 'absolute',
            top: appConfig.commercialMode ? '2.75rem' : '1rem',
            left: '1rem',
            background: 'linear-gradient(to bottom, rgba(0,0,0,0.7), transparent)',
            padding: '0.75rem 1rem',
            borderRadius: '8px',
            zIndex: 1000,
            maxWidth: 'calc(100% - 2rem)',
          }}
        >
          {currentSong && (
            <div style={{ color: 'white' }}>
              <div style={{ fontSize: '1.1rem', fontWeight: 'bold', lineHeight: '1.3', marginBottom: '0.25rem' }}>
                {currentSong.title || 'Unknown Song'}
              </div>
              <div style={{ fontSize: '0.9rem', opacity: 0.85 }}>
                {currentSong.user_name || 'Guest'}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Up Next Flying Banner — key remounts marquee so CSS animation never stalls mid-flight */}
      {showUpNextBanner && upNext && (
        <div
          className="kara-upnext-track"
          style={{
            position: 'absolute',
            top: '1.25rem',
            left: 0,
            right: 0,
            zIndex: 3500,
            pointerEvents: 'none',
          }}
        >
          <div key={`upnext-${upNext.id}`} className="kara-upnext-marquee">
            <div className="kara-upnext-pill">
              <span style={{ fontSize: '2rem' }}>🎵</span>
              <span style={{ textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 900 }}>UP NEXT:</span>
              <span>{upNext.title || 'Unknown Song'}</span>
              <span style={{ fontSize: '1.8rem' }}>👤</span>
              <span>{upNext.user_name || 'Guest'}</span>
            </div>
          </div>
        </div>
      )}

      {/* Controls Overlay — primary only (secondary is view-only follower) */}
      {isPrimaryTV && showControls && currentSong && !needsUserInteraction && !isYouTubeSong && (
        <div
          style={{
            position: 'absolute',
            bottom: '10px',
            left: 0,
            right: 0,
            background: 'linear-gradient(to top, rgba(0,0,0,0.9), transparent)',
            padding: '0.75rem 1rem 0.75rem 1rem',
            zIndex: 1000,
            paddingBottom: '1rem',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Controls Row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
            {/* Play/Pause Button */}
            <button
              onClick={async () => {
                if (videoRef.current && !playbackLockRef.current) {
                  playbackLockRef.current = true; // v4.7.1: Lock to prevent race conditions
                  const video = videoRef.current;
                  try {
                    // Check actual video state, not just isPlaying state
                    if (video.paused) {
                      // Video is paused, play it
                      await video.play();
                      setIsPlaying(true);
                    } else {
                      // Video is playing, pause it
                      video.pause();
                      setIsPlaying(false);
                    }
                  } catch (err) {
                    console.error('[tv] Play/pause failed:', err);
                  } finally {
                    playbackLockRef.current = false; // Release lock
                  }
                }
              }}
              style={{
                fontSize: '1.5rem',
                width: '36px',
                height: '36px',
                background: 'transparent',
                color: 'white',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '50%',
                transition: 'background 0.2s',
                flexShrink: 0,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.2)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              {videoRef.current && !videoRef.current.paused ? '⏸' : '▶'}
            </button>

            {/* Play Next Button */}
            <button
              onClick={handleManualAdvance}
              disabled={!currentSong && queue.length === 0}
              style={{
                fontSize: '1rem',
                padding: '0.4rem 0.8rem',
                background: (currentSong || queue.length > 0) ? 'rgba(255,255,255,0.2)' : 'rgba(128,128,128,0.3)',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: (currentSong || queue.length > 0) ? 'pointer' : 'not-allowed',
                transition: 'all 0.2s',
                flexShrink: 0,
              }}
              onMouseEnter={(e) => {
                if (currentSong || queue.length > 0) {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)';
                }
              }}
              onMouseLeave={(e) => {
                if (currentSong || queue.length > 0) {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.2)';
                }
              }}
            >
              ⏭️ Next
            </button>

            {/* Volume Control */}
            <div
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}
              onMouseEnter={() => setShowVolumeSlider(true)}
              onMouseLeave={() => setShowVolumeSlider(false)}
            >
              <button
                onClick={() => {
                  if (videoRef.current) {
                    const newVolume = volume > 0 ? 0 : 1;
                    videoRef.current.volume = newVolume;
                    setVolume(newVolume);
                  }
                }}
                style={{
                  fontSize: '1.3rem',
                  background: 'transparent',
                  border: 'none',
                  color: 'white',
                  cursor: 'pointer',
                  padding: '0.25rem',
                  width: '36px',
                  height: '36px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {volume === 0 ? '🔇' : volume < 0.5 ? '🔉' : '🔊'}
              </button>
              {showVolumeSlider && (
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={volume}
                  onChange={(e) => {
                    const newVolume = parseFloat(e.target.value);
                    if (videoRef.current) {
                      videoRef.current.volume = newVolume;
                      setVolume(newVolume);
                    }
                  }}
                  style={{ width: '80px' }}
                />
              )}
            </div>

            {/* Time Duration Display - YouTube style on right */}
            {duration > 0 && (
              <div style={{ 
                color: 'white', 
                fontSize: '0.9rem', 
                opacity: 0.9, 
                whiteSpace: 'nowrap',
                fontFamily: 'monospace',
                marginLeft: 'auto',
                flexShrink: 0,
              }}>
                {formatTime(currentTime)} / {formatTime(duration)}
              </div>
            )}

            {/* Fullscreen Button */}
            <button
              onClick={async () => {
                try {
                  if (!isFullscreen) {
                    if (videoRef.current?.requestFullscreen) {
                      await videoRef.current.requestFullscreen();
                    } else if ((videoRef.current as any)?.webkitRequestFullscreen) {
                      await (videoRef.current as any).webkitRequestFullscreen();
                    } else if ((videoRef.current as any)?.mozRequestFullScreen) {
                      await (videoRef.current as any).mozRequestFullScreen();
                    }
                  } else {
                    if (document.exitFullscreen) {
                      await document.exitFullscreen();
                    } else if ((document as any).webkitExitFullscreen) {
                      await (document as any).webkitExitFullscreen();
                    } else if ((document as any).mozCancelFullScreen) {
                      await (document as any).mozCancelFullScreen();
                    }
                  }
                } catch (err) {
                  console.error('Failed to toggle fullscreen:', err);
                }
              }}
              style={{
                fontSize: '1.2rem',
                padding: '0.5rem',
                background: 'transparent',
                border: 'none',
                color: 'white',
                cursor: 'pointer',
                flexShrink: 0,
                width: '36px',
                height: '36px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {isFullscreen ? '⤓' : '⤢'}
            </button>
          </div>

          {/* Progress Bar - YouTube style below buttons */}
          {duration > 0 && (
            <div
              style={{
                width: '100%',
                height: '4px',
                cursor: 'pointer',
                position: 'relative',
                marginTop: '0.5rem',
              }}
              onClick={(e) => {
                if (videoRef.current && duration > 0) {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const clickX = e.clientX - rect.left;
                  const percentage = clickX / rect.width;
                  const newTime = percentage * duration;
                  videoRef.current.currentTime = newTime;
                  setCurrentTime(newTime);
                }
              }}
            >
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  background: 'rgba(255,255,255,0.2)',
                  borderRadius: '2px',
                  position: 'relative',
                }}
              >
                <div
                  style={{
                    width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%`,
                    height: '100%',
                    background: '#ff0000',
                    borderRadius: '2px',
                  }}
                />
                <div
                  style={{
                    position: 'absolute',
                    left: `${duration > 0 ? (currentTime / duration) * 100 : 0}%`,
                    top: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: '12px',
                    height: '12px',
                    background: '#ff0000',
                    borderRadius: '50%',
                    opacity: showControls ? 1 : 0,
                    transition: 'opacity 0.2s',
                    boxShadow: '0 0 4px rgba(0,0,0,0.5)',
                  }}
                />
              </div>
            </div>
          )}
        </div>
      )}
      </div>

      {/* QR Code - upper left, under Primary/Secondary badge; ~25% smaller */}
      {room && (
        <div
          style={{
            position: 'absolute',
            top: appConfig.commercialMode ? '3.75rem' : '1rem',
            left: '1rem',
            zIndex: 600,
            background: 'rgba(255,255,255,0.95)',
            padding: '0.35rem',
            borderRadius: '8px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '0.15rem',
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
          }}
        >
          <div style={{ fontSize: '0.7rem', fontWeight: 'bold', textAlign: 'center', color: '#333', letterSpacing: '0.08em' }}>
            {room.room_code}
          </div>
          <div style={{ padding: '0.15rem', display: 'flex', justifyContent: 'center', alignItems: 'center', background: 'white', borderRadius: '4px' }}>
            <QRCode url={getQRCodeUrl(room.room_code)} size={60} />
          </div>
        </div>
      )}


      {/* Start Playing Button - centered overlay when queue has songs but nothing playing */}
      {!currentSong && queue.length > 0 && (
        <button
          onClick={async () => {
            if (room) {
              try {
                if (!isPrimaryTVRef.current) {
                  setError('Only primary TV can start playback');
                  return;
                }
                await api.advancePlayback(room.id, getTvAdvanceOpts());
                console.log('[tv] Manual start triggered');
              } catch (err) {
                console.error('[tv] Failed to start playback:', err);
              }
            }
          }}
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            padding: '2rem 3rem',
            background: 'rgba(0, 255, 0, 0.3)',
            border: '3px solid #00ff00',
            borderRadius: '16px',
            color: 'white',
            fontSize: '2rem',
            cursor: 'pointer',
            fontWeight: 'bold',
            zIndex: 1000,
            boxShadow: '0 8px 32px rgba(0, 255, 0, 0.3)',
            backdropFilter: 'blur(10px)',
            transition: 'all 0.3s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(0, 255, 0, 0.5)';
            e.currentTarget.style.transform = 'translate(-50%, -50%) scale(1.05)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(0, 255, 0, 0.3)';
            e.currentTarget.style.transform = 'translate(-50%, -50%) scale(1)';
          }}
        >
          ▶️ Start Playing
        </button>
      )}

      {/* Error Display */}
      {error && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'rgba(255,0,0,0.9)',
            color: 'white',
            padding: '2rem',
            borderRadius: '8px',
            zIndex: 2000,
            maxWidth: '90%',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '1rem',
          }}
        >
          <div style={{ fontSize: '1.5rem' }}>{error}</div>
          {/* Phase 1: Go Home button for expired rooms */}
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
      )}
    </div>
  );
}

export default function TVModePage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <TVModePageContent />
    </Suspense>
  );
}
