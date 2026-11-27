import { createClient } from '@supabase/supabase-js';
import { config } from '../config';
import { useLocalPg } from '@/server/lib/db';
import { pgAdmin } from '@/server/lib/pg-admin';

/**
 * Server DB admin client.
 * - DATABASE_URL set  → local Patroni `karaoke` via pg (Phase B)
 * - otherwise         → Supabase service role (rollback)
 */
function createSupabaseAdmin() {
  return createClient(config.supabase.url, config.supabase.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    },
  });
}

// Cast pg shim to Supabase client type so existing route typings keep working
export const supabaseAdmin = (
  useLocalPg ? pgAdmin : createSupabaseAdmin()
) as ReturnType<typeof createSupabaseAdmin>;

export const createSupabaseClient = (accessToken?: string) => {
  if (useLocalPg) {
    throw new Error('Browser/user Supabase client is disabled when DATABASE_URL is set');
  }
  return createClient(config.supabase.url, config.supabase.anonKey, {
    global: {
      headers: accessToken
        ? {
            Authorization: `Bearer ${accessToken}`,
          }
        : {},
    },
  });
};

export { useLocalPg };
