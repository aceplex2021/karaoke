import { createClient } from '@supabase/supabase-js';
import { createRequire } from 'module';

let _client = null;
const require = createRequire(import.meta.url);

/**
 * DB client for Controller writes.
 * Prefers DATABASE_URL (local Patroni / Phase B); falls back to Supabase service role.
 */
export function getSupabase() {
  if (_client) return _client;

  if (process.env.DATABASE_URL) {
    const { createPgAdmin } = require('./pg-admin.cjs');
    _client = createPgAdmin();
    console.log('🧠 Controller DB: local Postgres (DATABASE_URL)');
    return _client;
  }

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      'DB env missing. Set DATABASE_URL (Patroni) or SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (when WRITE_DB=true).'
    );
  }

  _client = createClient(url, key);
  console.log('🧠 Controller DB: Supabase');
  return _client;
}
