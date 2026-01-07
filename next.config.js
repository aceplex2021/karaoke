/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Allow cross-origin requests from local network devices
  allowedDevOrigins: ['10.0.29.228', '10.0.0.0/8'], // Your local IP and local network range
  // Allow API routes to proxy to backend
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.BACKEND_URL || 'http://localhost:3001'}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;

