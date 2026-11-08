import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // googleapis is heavy and only used server-side.
  serverExternalPackages: ['googleapis'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'img.unmatched.club',
      },
    ],
  },
};

export default nextConfig;