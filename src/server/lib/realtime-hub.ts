/**
 * In-process SSE hub for kara2 (single Next.js instance).
 * - Room events: from Postgres NOTIFY or explicit publishRoom
 * - Playhead: primary POSTs, secondaries subscribe
 */
import { EventEmitter } from 'events';
import { useLocalPg, getPool } from '@/server/lib/db';

type RoomListener = (payload: { roomId: string; event: string; at: number }) => void;
type PlayheadListener = (payload: Record<string, unknown>) => void;

const roomBus = new EventEmitter();
const playheadBus = new EventEmitter();
roomBus.setMaxListeners(200);
playheadBus.setMaxListeners(200);

let listenStarted = false;

export function publishRoom(roomId: string, event: string = 'change') {
  roomBus.emit(`room:${roomId}`, { roomId, event, at: Date.now() });
}

export function subscribeRoom(roomId: string, fn: RoomListener) {
  const key = `room:${roomId}`;
  roomBus.on(key, fn);
  return () => roomBus.off(key, fn);
}

export function publishPlayhead(roomId: string, payload: Record<string, unknown>) {
  playheadBus.emit(`playhead:${roomId}`, payload);
}

export function subscribePlayhead(roomId: string, fn: PlayheadListener) {
  const key = `playhead:${roomId}`;
  playheadBus.on(key, fn);
  return () => playheadBus.off(key, fn);
}

/** Start LISTEN kara_room on a dedicated client (local PG only). */
export async function ensurePgListener() {
  if (!useLocalPg || listenStarted) return;
  listenStarted = true;
  try {
    const client = await getPool().connect();
    await client.query('LISTEN kara_room');
    client.on('notification', (msg) => {
      if (msg.channel !== 'kara_room' || !msg.payload) return;
      try {
        const data = JSON.parse(msg.payload);
        if (data.roomId) publishRoom(String(data.roomId), data.event || 'change');
      } catch {
        /* ignore */
      }
    });
    client.on('error', (err) => {
      console.error('[realtime-hub] LISTEN client error', err);
      listenStarted = false;
      try {
        client.release(true);
      } catch {
        /* ignore */
      }
      setTimeout(() => {
        ensurePgListener().catch(() => {});
      }, 3000);
    });
    console.log('[realtime-hub] LISTEN kara_room started');
  } catch (err) {
    listenStarted = false;
    console.error('[realtime-hub] Failed to LISTEN', err);
  }
}
