import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // googleapis is heavy and only used server-side.
  serverExternalPackages: ['googleapis'],
};

export default nextConfig;
