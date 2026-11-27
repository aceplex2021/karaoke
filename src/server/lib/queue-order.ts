/**
 * Queue ordering helpers — sort_key is the single source of truth.
 * position is kept in sync for legacy readers / display badges.
 */
import { supabaseAdmin } from '@/server/lib/supabase';

export async function renumberPendingPositions(roomId: string): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from('kara_queue')
    .select('id')
    .eq('room_id', roomId)
    .eq('status', 'pending')
    .order('sort_key', { ascending: true });

  if (error || !data?.length) return;

  // Sequential updates keep ordering deterministic under load
  for (let i = 0; i < data.length; i++) {
    const { error: updErr } = await supabaseAdmin
      .from('kara_queue')
      .update({ position: i + 1 })
      .eq('id', data[i].id);
    if (updErr) {
      console.error('[queue-order] renumber failed for', data[i].id, updErr);
    }
  }
}

export async function nextAppendPosition(roomId: string): Promise<number> {
  const { count } = await supabaseAdmin
    .from('kara_queue')
    .select('id', { count: 'exact', head: true })
    .eq('room_id', roomId)
    .eq('status', 'pending');
  return (count || 0) + 1;
}

type PendingRow = {
  id: string;
  user_id: string;
  sort_key: number;
  position: number;
  round_number: number | null;
};

/**
 * Nudge a pending item up/down by swapping sort_key with its visual neighbor.
 * Host: neighbor in full room queue. User: neighbor among that user's songs only.
 */
export async function nudgeQueueItem(opts: {
  queueItemId: string;
  roomId: string;
  direction: 'up' | 'down';
  scope: 'host' | 'user';
  userId: string;
}): Promise<{ ok: boolean; error?: string }> {
  const { queueItemId, roomId, direction, scope, userId } = opts;

  let query = supabaseAdmin
    .from('kara_queue')
    .select('id, user_id, sort_key, position, round_number')
    .eq('room_id', roomId)
    .eq('status', 'pending')
    .order('sort_key', { ascending: true });

  if (scope === 'user') {
    query = query.eq('user_id', userId);
  }

  const { data: rows, error } = await query;
  if (error || !rows?.length) {
    return { ok: false, error: 'Failed to fetch queue' };
  }

  const pending = rows as PendingRow[];
  const index = pending.findIndex((r) => r.id === queueItemId);
  if (index < 0) {
    return { ok: false, error: 'Queue item not found in pending list' };
  }

  const targetIndex = direction === 'up' ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= pending.length) {
    return { ok: false, error: 'Cannot reorder: already at top/bottom' };
  }

  const a = pending[index];
  const b = pending[targetIndex];

  // Swap sort_keys (and round_number so RR badges stay with visual slots)
  const { error: e1 } = await supabaseAdmin
    .from('kara_queue')
    .update({ sort_key: b.sort_key, round_number: b.round_number ?? a.round_number })
    .eq('id', a.id);
  if (e1) return { ok: false, error: e1.message };

  const { error: e2 } = await supabaseAdmin
    .from('kara_queue')
    .update({ sort_key: a.sort_key, round_number: a.round_number ?? b.round_number })
    .eq('id', b.id);
  if (e2) return { ok: false, error: e2.message };

  await renumberPendingPositions(roomId);
  return { ok: true };
}
