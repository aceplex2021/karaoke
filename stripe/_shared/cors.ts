const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'https://hvga.netlify.app',
  'https://hvga2025.netlify.app'
];

export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'x-client-info, apikey, content-type, authorization, x-client-info',
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Max-Age': '86400',
  'Access-Control-Expose-Headers': '*'
};

export function handleCors(request: Request): Response | null {
  const origin = request.headers.get('origin');
  
  // Only allow requests from our allowed origins
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  
  // Handle preflight
  if (request.method === 'OPTIONS') {
    return new Response('ok', { 
      headers: {
        ...corsHeaders,
        'Access-Control-Allow-Origin': allowedOrigin,
        'Content-Length': '0',
        'Content-Type': 'text/plain'
      }
    });
  }

  // For non-preflight requests, return null to continue processing
  // but add the origin to the headers that will be merged later
  corsHeaders['Access-Control-Allow-Origin'] = allowedOrigin;
  return null;
}