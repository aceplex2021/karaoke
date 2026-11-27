/**
 * Local Postgres pool (Patroni VIP via DATABASE_URL).
 * Used when DATABASE_URL is set; otherwise server keeps Supabase admin client.
 */
import { Pool, type QueryResultRow } from 'pg';

const connectionString = process.env.DATABASE_URL || '';

export const useLocalPg = Boolean(connectionString);

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!useLocalPg) {
    throw new Error('DATABASE_URL is not set');
  }
  if (!pool) {
    pool = new Pool({
      connectionString,
      // Keep karaoke off the trading box under load
      max: Number(process.env.PG_POOL_MAX || 10),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
    pool.on('error', (err) => {
      console.error('[db] Unexpected pool error', err);
    });
  }
  return pool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
) {
  return getPool().query<T>(text, params);
}

export async function notifyRoom(roomId: string, event: string = 'change') {
  // Same-process fanout (works even before LISTEN is up)
  try {
    const { publishRoom } = await import('@/server/lib/realtime-hub');
    publishRoom(roomId, event);
  } catch {
    /* hub may not load in some scripts */
  }
  if (!useLocalPg) return;
  try {
    await query('SELECT pg_notify($1, $2)', [
      'kara_room',
      JSON.stringify({ roomId, event, at: Date.now() }),
    ]);
  } catch (err) {
    console.warn('[db] NOTIFY failed', err);
  }
}
