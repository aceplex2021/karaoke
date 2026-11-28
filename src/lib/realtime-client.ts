/**
 * Browser helper: SSE room + playhead stream (Phase B local realtime).
 */
export type RealtimeHandlers = {
  onRoom?: (payload: { roomId: string; event: string; at: number }) => void;
  onPlayhead?: (payload: {
    entryId?: string;
    t: number;
    paused: boolean;
    wallMs: number;
  }) => void;
  onError?: (err: Event) => void;
  onReady?: () => void;
};

export function connectRoomRealtime(roomId: string, handlers: RealtimeHandlers) {
  const url = `/api/realtime/stream?roomId=${encodeURIComponent(roomId)}`;
  const es = new EventSource(url);

  es.addEventListener('ready', () => handlers.onReady?.());
  es.addEventListener('room', (ev) => {
    try {
      handlers.onRoom?.(JSON.parse((ev as MessageEvent).data));
    } catch {
      /* ignore */
    }
  });
  es.addEventListener('playhead', (ev) => {
    // Skip parse work when caller does not care (e.g. primary TV)
    if (!handlers.onPlayhead) return;
    try {
      handlers.onPlayhead(JSON.parse((ev as MessageEvent).data));
    } catch {
      /* ignore */
    }
  });
  es.onerror = (err) => handlers.onError?.(err);

  return () => {
    es.close();
  };
}

/** Drop overlapping playhead POSTs — TV browsers pile up promises. */
let playheadInFlight = false;
let playheadQueued: {
  roomId: string;
  entryId: string;
  t: number;
  paused: boolean;
  wallMs?: number;
} | null = null;

const PLAYHEAD_POST_TIMEOUT_MS = 2500;

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function postPlayhead(payload: {
  roomId: string;
  entryId: string;
  t: number;
  paused: boolean;
  wallMs?: number;
}) {
  if (playheadInFlight) {
    playheadQueued = payload;
    return;
  }
  playheadInFlight = true;
  try {
    let next: typeof payload | null = payload;
    while (next) {
      const body = next;
      next = null;
      try {
        await fetchWithTimeout(
          '/api/realtime/playhead',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            cache: 'no-store',
            keepalive: true,
          },
          PLAYHEAD_POST_TIMEOUT_MS
        );
      } catch {
        /* best-effort — never leave inFlight stuck */
      }
      next = playheadQueued;
      playheadQueued = null;
    }
  } finally {
    playheadInFlight = false;
  }
}

/** Secondary delivery backup when SSE playhead events are dropped. */
export async function fetchLastPlayhead(roomId: string): Promise<{
  entryId?: string;
  t: number;
  paused: boolean;
  wallMs: number;
} | null> {
  try {
    const res = await fetchWithTimeout(
      `/api/realtime/playhead?roomId=${encodeURIComponent(roomId)}`,
      { cache: 'no-store' },
      PLAYHEAD_POST_TIMEOUT_MS
    );
    if (!res.ok) return null;
    const data = await res.json();
    const p = data?.playhead;
    if (!p || typeof p.t !== 'number') return null;
    return {
      entryId: p.entryId,
      t: p.t,
      paused: Boolean(p.paused),
      wallMs: typeof p.wallMs === 'number' ? p.wallMs : Date.now(),
    };
  } catch {
    return null;
  }
}
