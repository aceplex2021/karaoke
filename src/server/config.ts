import dotenv from 'dotenv';

dotenv.config();

export const config = {
  supabase: {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  },
  mediaServer: {
    baseUrl: process.env.MEDIA_SERVER_URL || 'http://media.local/karaoke/videos',
  },
  server: {
    // Backend always uses port 3001 (frontend uses 3000)
    port: parseInt(process.env.BACKEND_PORT || process.env.PORT || '3001', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
  },
};

