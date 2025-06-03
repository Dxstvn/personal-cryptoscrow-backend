/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'https://clearhold.app',
    NEXT_PUBLIC_DOMAIN: process.env.NEXT_PUBLIC_DOMAIN || 'clearhold.app',
    NEXT_PUBLIC_FRONTEND_URL: process.env.NEXT_PUBLIC_FRONTEND_URL || 'https://clearhold.app',
  },
  async headers() {
    return [
      {
        // Apply headers to all routes
        source: '/(.*)',
        headers: [
          {
            key: 'Access-Control-Allow-Origin',
            value: 'https://clearhold.app',
          },
          {
            key: 'Access-Control-Allow-Methods',
            value: 'GET, POST, PUT, DELETE, OPTIONS',
          },
          {
            key: 'Access-Control-Allow-Headers',
            value: 'Content-Type, Authorization',
          },
        ],
      },
    ];
  },
}

export default nextConfig
