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
    try {
      handlers.onPlayhead?.(JSON.parse((ev as MessageEvent).data));
    } catch {
      /* ignore */
    }
  });
  es.onerror = (err) => handlers.onError?.(err);

  return () => {
    es.close();
  };
}

export async function postPlayhead(payload: {
  roomId: string;
  entryId: string;
  t: number;
  paused: boolean;
  wallMs?: number;
}) {
  try {
    await fetch('/api/realtime/playhead', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
    });
  } catch {
    /* best-effort */
  }
}
