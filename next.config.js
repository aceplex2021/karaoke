/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Allow cross-origin requests from local network devices
  allowedDevOrigins: ['10.0.29.228', '10.0.0.0/8'], // Your local IP and local network range
  // No rewrites needed - API routes are now in Next.js
};

export default nextConfig;

