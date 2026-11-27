/**
 * Upsert karaoke user from Google OAuth profile.
 */
import { query, useLocalPg } from '@/server/lib/db';
import { supabaseAdmin } from '@/server/lib/supabase';

export type GoogleProfileInput = {
  sub: string;
  email?: string | null;
  name?: string | null;
};

export async function ensureGoogleKaraUser(profile: GoogleProfileInput): Promise<{
  id: string;
  display_name: string | null;
  email: string | null;
}> {
  const sub = profile.sub;
  if (!sub) throw new Error('Google sub required');

  const displayName = (profile.name || profile.email || 'Singer').slice(0, 255);
  const email = profile.email || null;
  const fingerprint = `google:${sub}`;

  if (useLocalPg) {
    const existing = await query<{
      id: string;
      display_name: string | null;
      email: string | null;
    }>(
      `SELECT id, display_name, email FROM kara_users WHERE google_sub = $1 LIMIT 1`,
      [sub]
    );
    if (existing.rows[0]) {
      await query(
        `UPDATE kara_users
         SET last_seen_at = NOW(),
             email = COALESCE($2, email),
             display_name = COALESCE(display_name, $3)
         WHERE id = $1`,
        [existing.rows[0].id, email, displayName]
      );
      return {
        id: existing.rows[0].id,
        display_name: existing.rows[0].display_name || displayName,
        email: email || existing.rows[0].email,
      };
    }

    const inserted = await query<{
      id: string;
      display_name: string | null;
      email: string | null;
    }>(
      `INSERT INTO kara_users (google_sub, email, display_name, fingerprint, last_seen_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (fingerprint) DO UPDATE
         SET google_sub = EXCLUDED.google_sub,
             email = COALESCE(EXCLUDED.email, kara_users.email),
             last_seen_at = NOW()
       RETURNING id, display_name, email`,
      [sub, email, displayName, fingerprint]
    );
    return inserted.rows[0];
  }

  // Supabase fallback (pre-cutover / local without DATABASE_URL)
  const { data: existing } = await supabaseAdmin
    .from('kara_users')
    .select('id, display_name, email')
    .eq('google_sub', sub)
    .maybeSingle();

  if (existing) {
    await supabaseAdmin
      .from('kara_users')
      .update({
        last_seen_at: new Date().toISOString(),
        email: email || existing.email,
      })
      .eq('id', existing.id);
    return existing;
  }

  const { data: created, error } = await supabaseAdmin
    .from('kara_users')
    .insert({
      google_sub: sub,
      email,
      display_name: displayName,
      fingerprint,
    })
    .select('id, display_name, email')
    .single();

  if (error || !created) {
    throw new Error(error?.message || 'Failed to create Google user');
  }
  return created;
}
