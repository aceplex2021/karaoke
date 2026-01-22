/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Allow cross-origin requests from local network devices and ngrok
  // UPDATE THIS when your ngrok domain changes!
  allowedDevOrigins: [
    '10.0.29.228', 
    '10.0.0.0/8',
    '192.168.0.0/16',
    '98408f91f910.ngrok-free.app', // ✅ Your current ngrok domain
  ],
  
  // ENFORCE: No caching for API routes (state apps need fresh data)
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-store, no-cache, must-revalidate, proxy-revalidate'
          },
          {
            key: 'Pragma',
            value: 'no-cache'
          },
          {
            key: 'Expires',
            value: '0'
          },
          {
            key: 'Surrogate-Control',
            value: 'no-store'
          }
        ]
      }
    ];
  }
};

export default nextConfig;

