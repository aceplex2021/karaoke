// Next.js automatically loads .env.local, .env, etc.
// No need for dotenv.config() in Next.js API routes

export const config = {
  supabase: {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  },
  mediaServer: {
    baseUrl: process.env.MEDIA_SERVER_URL || 'http://media.local/karaoke/videos',
  },
};

