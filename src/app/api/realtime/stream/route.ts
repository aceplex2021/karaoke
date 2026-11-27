import { NextRequest } from 'next/server';
import {
  ensurePgListener,
  subscribePlayhead,
  subscribeRoom,
} from '@/server/lib/realtime-hub';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/realtime/stream?roomId=...
 * SSE: room change events + playhead packets for secondary TVs.
 */
export async function GET(request: NextRequest) {
  const roomId = request.nextUrl.searchParams.get('roomId');
  if (!roomId) {
    return new Response(JSON.stringify({ error: 'roomId required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  await ensurePgListener();

  const encoder = new TextEncoder();
  let closed = false;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let unsubRoom: (() => void) | null = null;
  let unsubPlayhead: (() => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          );
        } catch {
          closed = true;
        }
      };

      send('ready', { roomId, at: Date.now() });

      unsubRoom = subscribeRoom(roomId, (payload) => {
        send('room', payload);
      });
      unsubPlayhead = subscribePlayhead(roomId, (payload) => {
        send('playhead', payload);
      });

      heartbeat = setInterval(() => {
        send('ping', { at: Date.now() });
      }, 15000);

      request.signal.addEventListener('abort', () => {
        closed = true;
        if (heartbeat) clearInterval(heartbeat);
        unsubRoom?.();
        unsubPlayhead?.();
        try {
          controller.close();
        } catch {
          /* ignore */
        }
      });
    },
    cancel() {
      closed = true;
      if (heartbeat) clearInterval(heartbeat);
      unsubRoom?.();
      unsubPlayhead?.();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
