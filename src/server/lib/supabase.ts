import { createClient } from '@supabase/supabase-js';
import { config } from '../config';

// Server-side Supabase client with service role key for admin operations
export const supabaseAdmin = createClient(
  config.supabase.url,
  config.supabase.serviceRoleKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
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

