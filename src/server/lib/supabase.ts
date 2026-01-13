import { createClient } from '@supabase/supabase-js';
import { config } from '../config';

// Server-side Supabase client with service role key for admin operations
// ENFORCE: No caching by design
export const supabaseAdmin = createClient(
  config.supabase.url,
  config.supabase.serviceRoleKey,
  {
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
  }
);

// Client-side Supabase client (for use in API routes that need user context)
export const createSupabaseClient = (accessToken?: string) => {
  const client = createClient(config.supabase.url, config.supabase.anonKey, {
    global: {
      headers: accessToken
        ? {
            Authorization: `Bearer ${accessToken}`,
          }
        : {},
    },
  });
  return client;
};

